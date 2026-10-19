global vrRetainedNames, vrRefreshControlNames, vrCollectNames, vrWalkControllers, vrAngle, vrRestTM, vrMeasureRig, vrSnapshot, vrCompare
fileIn "E:/AI/DSH/_mytools/Mode/dsh-3dsmax/work/Validation_20261019_Second/helpers.ms"
fileIn "E:/AI/DSH/_mytools/Mode/dsh-3dsmax/work/Validation_20261019_Second/controllers.ms"
fileIn "E:/AI/DSH/_mytools/Mode/dsh-3dsmax/work/Validation_20261019_Second/source_ring_offsets.ms"
fileIn "E:/AI/DSH/_mytools/Mode/dsh-3dsmax/work/Validation_20261019_Second/measure.ms"
fileIn "E:/AI/DSH/_mytools/Mode/dsh-3dsmax/work/Validation_20261019_Second/acceptance.ms"
vrRefreshControlNames()
vrControlNames=for n in vrControlNames where not matchPattern n pattern:"SV_*" collect n
vrRetainedNames=makeUniqueArray ((for a in vrRest collect a[1])+(for a in vrRest collect "BIPDRV_"+a[1])+(for o in objects where matchPattern o.name pattern:"bip001*" collect o.name)+vrControlNames)
vrMeasureRig verbose:true
