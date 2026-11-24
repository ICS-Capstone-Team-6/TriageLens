"""TB model: pretrained backbone, global average pooling, one linear layer (story E2-01).

ADR-3 and ADR-15: two backbone candidates. ADR-9: pooling plus one linear layer, so a
class activation map is the feature map weighted by the linear layer, with no gradients.
ADR-14: one output, a TB logit.
"""

import timm
import torch
from torch import nn

BACKBONES = {
    "mobilenetv3_large": "mobilenetv3_large_100.ra_in1k",
    "efficientnet_lite0": "efficientnet_lite0.ra_in1k",
}


class TBNet(nn.Module):
    def __init__(self, backbone="mobilenetv3_large", pretrained=True):
        super().__init__()
        if backbone not in BACKBONES:
            raise ValueError(f"unknown backbone {backbone!r}, expected one of {sorted(BACKBONES)}")
        # num_classes=0 and global_pool='' return the last feature map, unpooled
        self.backbone = timm.create_model(BACKBONES[backbone], pretrained=pretrained,
                                          num_classes=0, global_pool="")
        self.fc = nn.Linear(self.backbone.num_features, 1)

    def forward_features(self, x):
        return self.backbone.forward_features(x)

    def forward(self, x, return_features=False):
        fmap = self.forward_features(x)
        logit = self.fc(fmap.mean(dim=(2, 3))).squeeze(1)
        return (logit, fmap) if return_features else logit

    def cam(self, fmap):
        """Class activation map for the TB output: (B, C, h, w) -> (B, h, w)."""
        return torch.einsum("bchw,c->bhw", fmap, self.fc.weight[0])

    def head_parameters(self):
        return self.fc.parameters()

    def freeze_backbone(self, frozen=True):
        for p in self.backbone.parameters():
            p.requires_grad = not frozen
