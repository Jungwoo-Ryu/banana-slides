"""RMBG-2.0 ONNX Local Jurisprudence Curve provider。

Model：AI-ModelScope/RMBG-2.0 (FP16 ONNX mirror)，CPU Arguments。
Use lazy download for the first time ~/.cache/banana-slides/models/rmbg-2.0/model_fp16.onnx，
It’s possible. RMBG_MODEL_PATH Environment variable specifies the local model path to go around download。

Note： Models are non-commercial license，Only for local reasoning。
"""
import logging
import os
import threading
from pathlib import Path
from typing import Optional

import numpy as np
from PIL import Image

logger = logging.getLogger(__name__)

_MODEL_URL = ""
_DEFAULT_MODEL_PATH = Path.home() / ".cache" / "banana-slides" / "models" / "rmbg-2.0" / "model_fp16.onnx"
_INPUT_SIZE = 1024
_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
_STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)


def _resolve_model_path() -> Path:
    """Priority RMBG_MODEL_PATH，Otherwise use the default cache path。"""
    env_path = os.environ.get("RMBG_MODEL_PATH")
    if env_path:
        return Path(env_path).expanduser()
    return _DEFAULT_MODEL_PATH


def _download_model(target: Path) -> None:
    raise ValueError('자동 모델 다운로드는 사용하지 않습니다. 별도 라이선스를 확인한 로컬 모델을 RMBG_MODEL_PATH로 지정하세요.')


def _sigmoid(x: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-x))


def _decontaminate_foreground(
    rgb: np.ndarray,
    alpha: np.ndarray,
    bg_alpha_threshold: float = 0.05,
    fg_alpha_floor: float = 0.1,
) -> np.ndarray:
    """From Soft alpha The edge pixels remove the original background color and return to the near future. RGB。

    - Use it. alpha < bg_alpha_threshold pixel average estimated original background colour B
    - Other Pixels F = (C - (1-α)·B) / α，alpha It’s too small.（< fg_alpha_floor）Time
      Limit denominator to avoid noise magnification
    - You can’t estimate the background (this pixel is too small) and return as it is.
    """
    bg_mask = alpha < bg_alpha_threshold
    if bg_mask.sum() < 100:
        return rgb

    bg_color = rgb[bg_mask].mean(axis=0)
    a = np.clip(alpha[..., None], fg_alpha_floor, 1.0)
    fg = (rgb - (1.0 - a) * bg_color) / a
    fg = np.clip(fg, 0.0, 255.0)
    return np.where(alpha[..., None] >= bg_alpha_threshold, fg, rgb)


class RmbgSegmentationProvider:
    """RMBG-2.0 ONNX FP16 Local reasoning provider。"""

    def __init__(self, model_path: Optional[Path] = None):
        self._model_path = model_path or _resolve_model_path()
        self._session = None
        self._input_name: Optional[str] = None
        self._init_lock = threading.Lock()

    def _ensure_session(self) -> None:
        if self._session is not None:
            return
        with self._init_lock:
            if self._session is not None:
                return
            if not self._model_path.exists():
                _download_model(self._model_path)

            import onnxruntime as ort

            logger.info(f"🧠 Load RMBG-2.0 ONNX Model: {self._model_path}")
            self._session = ort.InferenceSession(
                str(self._model_path), providers=["CPUExecutionProvider"]
            )
            self._input_name = self._session.get_inputs()[0].name

    def extract_subject(self, image: Image.Image) -> Optional[Image.Image]:
        """Right Input PIL Image Pull out the subject, return RGBA；Failed to return None。"""
        try:
            self._ensure_session()
            rgb = image.convert("RGB")
            orig_size = rgb.size  # (w, h)
            resized = rgb.resize((_INPUT_SIZE, _INPUT_SIZE), Image.LANCZOS)

            arr = np.asarray(resized, dtype=np.float32) / 255.0
            arr = (arr - _MEAN) / _STD
            tensor = arr.transpose(2, 0, 1)[np.newaxis, ...].astype(np.float32)

            outputs = self._session.run(None, {self._input_name: tensor})
            mask = outputs[-1] if isinstance(outputs, (list, tuple)) else outputs

            mask = np.asarray(mask, dtype=np.float32)
            mask = np.squeeze(mask)
            if mask.ndim != 2:
                logger.warning(f"RMBG Output shape Unusual: {mask.shape}，Skip")
                return None

            # RMBG-2.0 Output applied sigmoid，It’s coming down. [0,1]，But the numerical noise may have crossed a little bit.。
            # Only significantly more than that. [0,1] Time (clearly) raw logits）I’ll take care of it. sigmoid，Or shear it.。
            if mask.min() < -0.5 or mask.max() > 1.5:
                mask = _sigmoid(mask)

            mask = np.clip(mask, 0.0, 1.0)
            mask_uint8 = (mask * 255.0).astype(np.uint8)
            mask_pil = Image.fromarray(mask_uint8, mode="L").resize(orig_size, Image.BILINEAR)
            alpha_full = np.asarray(mask_pil, dtype=np.float32) / 255.0

            # Edge de-polluting： the softness of the model alpha Edge RGB Still mixed with the original background.，
            # The old background is leaked when synthesized to the new background. F=(C-(1-α)B)/α Introspective foreground.。
            rgb_decont = _decontaminate_foreground(np.asarray(rgb, dtype=np.float32), alpha_full)

            # Very thin. alpha（<0.05）Zero, zero, no. 1/α Magnify the noise and make it colored.。
            alpha_full = np.where(alpha_full < 0.05, 0.0, alpha_full)
            alpha_uint8 = np.clip(alpha_full * 255.0, 0, 255).astype(np.uint8)

            rgba = np.dstack([rgb_decont.astype(np.uint8), alpha_uint8])
            return Image.fromarray(rgba, mode="RGBA")
        except Exception as e:
            logger.warning(f"RMBG Shape Failed: {e}")
            return None


_singleton_lock = threading.Lock()
_singleton: Optional[RmbgSegmentationProvider] = None


def create_rmbg_segmentation_provider() -> RmbgSegmentationProvider:
    """Single factory。"""
    global _singleton
    if _singleton is not None:
        return _singleton
    with _singleton_lock:
        if _singleton is None:
            _singleton = RmbgSegmentationProvider()
    return _singleton
