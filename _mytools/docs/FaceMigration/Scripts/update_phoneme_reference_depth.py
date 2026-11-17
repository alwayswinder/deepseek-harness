"""口型图贴近轨道：复用共用布局修复，默认位于轨道后 1 cm。

通过 migrate.py run update_phoneme_reference_depth.py --job <任务> 执行。
目标和输出由任务配置决定，不再改写固定的历史示例资产。
"""
from update_slider_handle_depth import main

if __name__ == '__main__':
    main()
