# Release provenance

Source: the local SC-GS working tree, curated on 2026-11-12. The source repository HEAD was `99af15a` at inspection; working-tree file hashes, rather than that commit alone, identify the selected inputs.

Selection follows the source technical document `assets/technical/03-mercy.md`: the articulated MERCY pipeline with local joint-MLP compensation. `source-manifest.json` records SHA-256 hashes of the original selected Python files. The release includes their transitive local Python imports and package initializers. This preserves necessary historical implementation dependencies without shipping every historical executable.

The original SC-GS directory has not been modified. Generated experiments, raw data, checkpoints, caches, old web deployments, and redundant media were excluded from MERCY. Three source-project figures were retained. Some inherited internal renderer/export messages remain localized; the release documentation and supported command-line overview are English.

The source is a collection of research stages, not a verified clean-room reproduction. There is no evidence supporting the assertion that a single included checkpoint is best: no checkpoints are included. CUDA execution and full training must be validated with the corresponding assets.
