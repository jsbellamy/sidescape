/** Reproducible placement manifest for #141's transparent player-plane activity overlays. */
export const overlays = [
  { name: "activity-anvil-near", place: "48,50", fit: "14,10" },
  { name: "activity-cooking-near", place: "48,50", fit: "16,12" },
  { name: "activity-crafting-near", place: "48,50", fit: "24,14" },
  { name: "activity-cauldron-near", place: "48,50", fit: "14,12" },
  { name: "activity-fishing-near", place: "48,50", fit: "30,20" },
  // Per-Theme fishing water props (#435). Water-source only (no rod — player holds the rod after
  // #436). zone drives ingest-overlay quantization; place matches every other prop so the
  // scene-separation band shift keeps them aligned. Interim shared activity-fishing-near stays
  // above until the wiring slice deletes it.
  { name: "activity-fishing-meadow-near", place: "48,50", fit: "30,20", zone: "meadow" },
  { name: "activity-fishing-forest-near", place: "48,50", fit: "30,20", zone: "forest" },
  { name: "activity-fishing-sewer-near", place: "48,50", fit: "30,20", zone: "sewer" },
  { name: "activity-fishing-crypt-near", place: "48,50", fit: "30,20", zone: "crypt" },
  { name: "activity-fishing-glacier-near", place: "48,50", fit: "30,20", zone: "glacier" },
];
