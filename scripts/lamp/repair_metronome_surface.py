"""Repair an existing Gaussian cloud against the supplied rigid surface prior.

Keeps supported source rows, bounds their surface displacement, aligns
covariance to the nearest surface, fills gaps, and rebinds to rigid parts.
This is an explicitly prior-assisted refinement, not a new baseline training run.
"""
import argparse
import json
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
import numpy as np
from scipy.spatial import cKDTree
from utils.fan_surface import attributes


def repair(vertices, prior, labels, maximum_distance=.012, color_blend=.85):
    xyz, _, scale, alpha, color = attributes(vertices)
    px, basis, _, _, pc = attributes(prior)
    distance, nearest = cKDTree(px).query(xyz, workers=4)
    keep = (distance <= maximum_distance) & (alpha > .1)
    ids = np.flatnonzero(keep)
    if len(ids) < len(vertices)*.5:
        raise ValueError('Surface prior rejects too much of the source cloud')
    nearest = nearest[ids]; normal = basis[nearest, :, 2]
    offset = np.sum((xyz[ids]-px[nearest])*normal, axis=1)[:,None]*normal
    result = vertices[ids].copy()
    projected = xyz[ids]-offset
    tangent_offset = projected-px[nearest]
    projected = px[nearest]+tangent_offset*np.minimum(1., .0007/np.maximum(np.linalg.norm(tangent_offset,axis=1,keepdims=True),1e-12))
    for i, key in enumerate(('x','y','z')): result[key] = projected[:,i]
    for i in range(4): result[f'rot_{i}'] = prior[f'rot_{i}'][nearest]
    tangent = np.clip(np.sort(scale[ids],axis=1)[:,1:], .0005, .0018)
    for i in range(2): result[f'scale_{i}'] = np.log(tangent[:,i])
    result['scale_2'] = np.log(np.minimum(tangent.min(1)*.08,.00012))
    opacity = np.clip(alpha[ids],.85,.995)
    result['opacity'] = np.log(opacity/(1-opacity))
    rgb = np.clip((1-color_blend)*color[ids]+color_blend*pc[nearest],0,1)
    for i in range(3): result[f'f_dc_{i}'] = (rgb[:,i]-.5)/.28209479177387814
    repaired_groups = labels[nearest]
    # Preserve small source components that the supplied cloud barely covers.
    restored = []
    for group in np.unique(labels):
        prior_ids = np.flatnonzero(labels == group)
        if np.count_nonzero(repaired_groups == group) < .2*len(prior_ids):
            retain = repaired_groups != group
            result = np.concatenate([result[retain], prior[prior_ids]])
            ids = np.concatenate([ids[retain], np.full(len(prior_ids), -1, np.int64)])
            repaired_groups = np.concatenate([repaired_groups[retain], labels[prior_ids]])
            restored.append(dict(group=int(group), prior_rows=len(prior_ids)))
    current_xyz = np.column_stack([result[key] for key in ('x','y','z')])
    coverage_distance = cKDTree(current_xyz).query(px, workers=4)[0]
    fill = np.flatnonzero(coverage_distance > .0012)
    if len(fill):
        result = np.concatenate([result, prior[fill]])
        repaired_groups = np.concatenate([repaired_groups, labels[fill]])
        ids = np.concatenate([ids, np.full(len(fill), -1, np.int64)])
    report = dict(coverage_fill_rows=len(fill),maximum_tangent_offset=.0007,restored_small_parts=restored,input_gaussians=len(vertices),output_gaussians=len(result),removed=int((~keep).sum()),
        max_normal_displacement=float(np.linalg.norm(offset,axis=1).max()),maximum_surface_distance=maximum_distance,
        patch_color_blend=color_blend,method='Source rows with normal projection, bounded tangent displacement, tangent covariance, prior gap filling and exact source-part binding',
        limitation='Uses supplied Blender geometry and source-part animation; refined baseline, not an untouched Mono4DGS training result')
    return result, repaired_groups, ids, report


def main():
    from plyfile import PlyData, PlyElement
    from utils.gaussian_pair_renderer import file_sha
    from scripts.lamp.prepare_lamp_viewer import bake, rigid_deltas
    from scripts.motion.bind_lego_parts import transform
    parser=argparse.ArgumentParser(description=__doc__)
    for key in ('sequence','surface-sequence','surface-binding','parts','binding-report','output'):
        parser.add_argument('--'+key,type=Path,required=True)
    args=parser.parse_args()
    if args.output.exists():raise FileExistsError(args.output)
    with np.load(args.sequence,allow_pickle=False) as z:
        vertices=z['base_vertices'];meta=json.loads(str(z['metadata_json']))
    with np.load(args.surface_sequence,allow_pickle=False) as z:prior=z['base_vertices']
    with np.load(args.surface_binding,allow_pickle=False) as z:labels=z['groups']
    binding=json.loads(args.binding_report.read_text())
    if binding['parts_sha256']!=file_sha(args.parts):raise ValueError('Source parts identity changed')
    out,groups,parents,report=repair(vertices,prior,labels)
    args.output.mkdir(parents=True)
    ply=args.output/'repaired.ply';PlyData([PlyElement.describe(out,'vertex')],text=False).write(ply)
    with np.load(args.parts,allow_pickle=False) as z:
        reg=np.asarray(binding['registration']);surface=transform(z['rest_points'],reg)
        source_groups=z['point_parts'];delta=rigid_deltas(z['object_matrices'],reg)
    identity=dict(parent_sequence=str(args.sequence),parent_sha256=file_sha(args.sequence),
        surface_sequence=str(args.surface_sequence),surface_sha256=file_sha(args.surface_sequence),
        binding_sha256=file_sha(args.surface_binding),parts_sha256=file_sha(args.parts))
    stats=bake(ply,args.output/'sequence.npz',surface,source_groups,delta,meta['preview_camera'],
        dict(frame_count=meta['frame_count'],fps=meta['fps']),dict(meta['provenance'],surface_repair=identity),
        bound_labels=groups,name=meta.get('name', 'Object'))
    np.savez_compressed(args.output/'binding.npz',groups=groups,parent_rows=parents)
    report.update(identity=identity,binding=stats,sequence_sha256=file_sha(args.output/'sequence.npz'))
    (args.output/'report.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report),flush=True)

if __name__=='__main__':main()
