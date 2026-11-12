# Reproduction contract

Supply an initial Gaussian model, calibrated camera, RGB observations, raw timestamped events and their calibration, Blender-derived motion, part assignments, and a compatible articulated base-field checkpoint. Source scripts define the exact formats and flags; pretrained assets are not bundled.

1. Establish the baseline sequence and preserve Gaussian row ordering.
2. Validate joint parents, pivots, axes, protected degrees of freedom, and rigid-group membership.
3. Refine allowed motion with calibrated observations and save correction provenance.
4. Repair bindings and visible surfaces before adding explicitly identified geometry priors for unobserved regions.
5. Refine appearance while preserving the declared frozen geometry and motion.
6. Train the local joint MLP using training events, preserving the parent transforms and protected joints.
7. Audit the candidate, export its poses, and pack the resulting sequence.

The retained scripts include dependency modules with historical names. They are necessary for reading the selected pipeline's existing artifacts. Filenames alone are not evidence that a module is obsolete.

Do not interpret lower temporal jerk as independent proof of correct motion. Geometry-prior completion is not independent validation of unseen surfaces. Keep training, validation, and held-out events separate. Record rejected candidates without presenting them as accepted reconstructions.

The source's historical five-scene adaptation experiment explicitly states that it is not the full original MERCY pipeline. It is excluded from this release, along with its obsolete reports. No aggregate accuracy numbers are reconstructed from screenshots.
