import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { buildSessionExport, migrateSessionPayload, APP_SCHEMA_VERSION } from "../app/src/lib/migrations";
import { assertValidSessionPayloadContract } from "../app/src/lib/contracts";

const basePayload = {
  schemaVersion: "1.0.0",
  session: {
    id: "sess_1",
    tabId: 10,
    startUrl: "https://example.com/start",
    startTitle: "Start",
    startedAt: 1000,
    updatedAt: 2000,
    stepsCount: 2,
    sync: { status: "local", revision: 1, lastSyncedAt: null, errorCode: null }
  },
  steps: [
    {
      id: "step_1",
      sessionId: "sess_1",
      stepIndex: 1,
      type: "click",
      url: "https://example.com/a",
      pageTitle: "A",
      at: 1100,
      annotations: [
        { id: "ann_1", x: 0.1, y: 0.2, width: 0.3, height: 0.4, type: "highlight" },
        { id: "ann_2", x: 0.2, y: 0.2, width: 0.3, height: 0.3, type: "redact" }
      ]
    },
    {
      id: "step_2",
      sessionId: "sess_1",
      stepIndex: 2,
      type: "input",
      url: "https://example.com/b",
      pageTitle: "B",
      at: 1200,
      annotations: []
    }
  ],
  meta: { capturedBy: "extension-local", appVersion: "0.0.0", syncRevision: 1 }
};
const exportSchema = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), "docs/export-schema.json"), "utf8")
);

function validateAgainstDocumentedSchema(payload: any) {
  assert.equal(exportSchema.type, "object", "schema root type should remain object");
  assert.deepEqual(exportSchema.required, ["schemaVersion", "session", "steps", "meta"], "top-level required fields should remain stable");
  assert.equal(payload.schemaVersion, exportSchema.properties.schemaVersion.const, "schemaVersion should match documented schema");
  assert.ok(payload.session && typeof payload.session.id === "string", "schema requires session.id");
  assert.ok(typeof payload.session.stepsCount === "number", "schema requires session.stepsCount");
  assert.ok(Array.isArray(payload.steps), "schema requires steps array");
  payload.steps.forEach((step: any) => {
    assert.ok(typeof step.id === "string", "schema requires step.id");
    assert.ok(typeof step.sessionId === "string", "schema requires step.sessionId");
    assert.ok(typeof step.type === "string", "schema requires step.type");
    assert.ok(typeof step.stepIndex === "number", "schema requires step.stepIndex");
    if (Array.isArray(step.annotations)) {
      step.annotations.forEach((ann: any) => {
        assert.ok(ann.type === "highlight" || ann.type === "redact", "schema requires annotation.type enum");
      });
    }
  });
}

function validateExportShape(payload: any) {
  assert.equal(payload.schemaVersion, APP_SCHEMA_VERSION, "schemaVersion should match current schema");
  assert.ok(typeof payload.exportedAt === "number", "exportedAt should be a number");
  assert.ok(payload.session && typeof payload.session.id === "string", "session.id required");
  assert.ok(Array.isArray(payload.steps) && payload.steps.length === payload.session.stepsCount, "steps count should match session.stepsCount");
  payload.steps.forEach((step: any) => {
    assert.ok(step.annotations, "annotations should exist");
    step.annotations.forEach((ann: any) => {
      assert.ok(ann.type === "highlight" || ann.type === "redact", "annotation.type must be highlight|redact");
    });
  });
  assert.ok(payload.meta && typeof payload.meta.syncRevision === "number", "meta.syncRevision should be present");
}

// Validate export built from migrated payload
const migrated = migrateSessionPayload(basePayload);
const built = buildSessionExport(migrated);
validateExportShape(built);
validateAgainstDocumentedSchema(built);
assert.equal(built.session.id, "sess_1", "session id should persist");
assert.equal(built.steps[0].annotations[1].type, "redact", "redact annotation should persist");

// Validate roundtrip of minimal payload with missing fields
const minimal = {
  schemaVersion: APP_SCHEMA_VERSION,
  session: { id: "sess_min" },
  steps: [
    {
      id: "step_min",
      sessionId: "sess_min",
      type: "unknown",
      annotations: [{ x: 0.5, y: 0.5, width: 0.2, height: 0.2, type: "highlight" }]
    }
  ],
  meta: {}
};
const migratedMinimal = migrateSessionPayload(minimal);
const exportedMinimal = buildSessionExport(minimal);
validateExportShape(exportedMinimal);
validateAgainstDocumentedSchema(exportedMinimal);
assert.equal(migratedMinimal.steps[0].annotations[0]?.type, "highlight", "annotation type should persist through migration");
assert.doesNotThrow(() => assertValidSessionPayloadContract(minimal), "valid payload should pass runtime validation");

const invalid = {
  schemaVersion: APP_SCHEMA_VERSION,
  session: { id: "sess_invalid", stepsCount: 1 },
  steps: [
    {
      id: "step_invalid",
      sessionId: "sess_invalid",
      stepIndex: 1,
      type: "click",
      annotations: [{ id: "ann_invalid", x: 0.1, y: 0.1, width: 0.2, height: 0.2, type: "mask" }]
    }
  ],
  meta: {}
};
assert.throws(
  () => assertValidSessionPayloadContract(invalid),
  /annotations\[0\]\.type must be "highlight" or "redact"/i,
  "invalid annotation type should fail runtime contract validation"
);
assert.throws(
  () => validateAgainstDocumentedSchema(invalid),
  /annotation\.type enum/i,
  "invalid annotation type should fail documented schema parity validation"
);

console.log("export-contract: ok");
