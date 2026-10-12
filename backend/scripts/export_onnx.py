"""Export the SpeechBrain ECAPA speaker model to ONNX so the server can run without torch.
Filterbank features are computed in numpy (waymark_server/fbank.py); this exports features -> embedding.

    python scripts/export_onnx.py <model_dir>   # writes <model_dir>/ecapa.onnx
"""
import os
import sys

import torch
from speechbrain.inference.speaker import EncoderClassifier


class Embedder(torch.nn.Module):
    def __init__(self, enc):
        super().__init__()
        self.model = enc.mods.embedding_model

    def forward(self, feats):  # (1, frames, 80) mean-normalised log filterbanks
        return self.model(feats).reshape(-1)


def main(model_dir):
    enc = EncoderClassifier.from_hparams(source="speechbrain/spkrec-ecapa-voxceleb",
                                         savedir=os.path.join(model_dir, "ecapa"), run_opts={"device": "cpu"})
    net = Embedder(enc).eval()
    dummy = torch.randn(1, 300, 80)
    out = os.path.join(model_dir, "ecapa.onnx")
    torch.onnx.export(net, (dummy,), out, input_names=["feats"], output_names=["embedding"],
                      dynamic_axes={"feats": {1: "frames"}}, opset_version=17, dynamo=False)
    print("wrote", out, os.path.getsize(out) // 1_000_000, "MB")
    fb = enc.mods.compute_features.compute_fbanks
    n = fb.all_freqs_mat.shape[1]
    matrix = fb._create_fbank_matrix(fb.f_central.repeat(n, 1).transpose(0, 1), fb.band.repeat(n, 1).transpose(0, 1))
    import numpy as np
    np.save(os.path.join(model_dir, "mel_filters.npy"), matrix.detach().cpu().numpy().astype(np.float32))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), "..", "models"))
