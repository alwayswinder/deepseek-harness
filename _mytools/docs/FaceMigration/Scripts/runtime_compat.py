"""旧配方访问 RuntimeAsset 的集中适配层；不伪造 Blueprint 编译通过状态。"""
import unreal


class RuntimeRig:
    def __init__(self, asset):
        self._fm_asset = asset
        self.editor = asset.get_editor_asset()

    def get_hierarchy(self):
        return self._fm_asset.hierarchy

    def get_hierarchy_controller(self):
        return self.get_hierarchy().get_controller()

    def get_default_model(self):
        return self.editor.get_default_model()

    def get_controller(self, model):
        return self.editor.get_controller(model)

    def create_control_rig(self):
        return self.editor.create_rig_vm_host()

    def get_debugged_control_rig(self):
        candidates = []
        mesh = self.get_preview_mesh()
        for component in unreal.ObjectIterator(unreal.SkeletalMeshComponent):
            if component.get_skinned_asset() != mesh or 'AnimationEditorPreviewActor' not in component.get_path_name():
                continue
            animation = component.get_anim_instance()
            if not animation:
                continue
            for host in unreal.RigVMHost.find_rig_vm_hosts(animation, unreal.ControlRig):
                if host.get_vm().get_outer() == self._fm_asset:
                    candidates.append(host)
        if len(candidates) > 1:
            raise RuntimeError('目标存在多个实际预览实例，请关闭旧预览后重新打开目标')
        return candidates[0] if candidates else None

    def get_editor_property(self, name):
        if name == 'status':
            return 'RuntimeAsset: BlueprintStatus unavailable; numerical verification required'
        return self._fm_asset.get_editor_property(name)

    def set_editor_property(self, name, value):
        return self._fm_asset.set_editor_property(name, value)

    def modify(self):
        return self._fm_asset.modify()

    def get_path_name(self):
        return self._fm_asset.get_path_name()

    def get_class(self):
        return self._fm_asset.get_class()

    def get_preview_mesh(self):
        return self._fm_asset.get_editor_property('preview_skeletal_mesh')

    def __getattr__(self, name):
        return getattr(self.editor, name)
