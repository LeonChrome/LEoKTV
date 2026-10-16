# Audio inference acknowledgments

The MDX architecture, STFT tensor layout, and overlap weighting are based on
Ultimate Vocal Remover and python-audio-separator (MIT).

- UVR: https://github.com/Anjok07/ultimatevocalremovergui
- python-audio-separator: https://github.com/nomadkaraoke/python-audio-separator
- MDX-Net: https://github.com/kuielab/mdx-net
- Model: UVR-MDX-NET-Inst_HQ_4.onnx, published by TRvlvr/model_repo
  https://github.com/TRvlvr/model_repo/releases/tag/all_public_uvr_models

The model is downloaded on first explicit use from its upstream release and
verified against the SHA-256 in model-manifest.json; it is not included in the installer.
No audio is uploaded. ONNX Runtime is MIT; NumPy, SciPy, and SoundFile are BSD licensed.
