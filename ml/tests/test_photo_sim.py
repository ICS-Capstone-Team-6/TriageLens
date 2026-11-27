"""Tests for the phone-photo simulation library (story E7-01; ML-ROBUST-01).

numpy and Pillow only, so they run in the light CI job. Synthetic images only.
Per effect (ml-experiment-protocol reference): shape and dtype kept, same seed gives the
same output, strength 0 returns the input, and a visible effect at full strength.
"""

import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "train"))
import photo_sim  # noqa: E402
from photo_sim import EFFECTS, PhotoSim  # noqa: E402


def rng(seed=0):
    return np.random.default_rng(seed)


def flat(value=128, shape=(96, 128)):
    return np.full(shape, value, np.uint8)


def high_freq_energy(img):
    """Mean squared Laplacian: falls when an image is blurred."""
    f = img.astype(np.float32)
    lap = 4 * f[1:-1, 1:-1] - f[:-2, 1:-1] - f[2:, 1:-1] - f[1:-1, :-2] - f[1:-1, 2:]
    return float(np.mean(lap ** 2))


class EveryEffect(unittest.TestCase):
    """Contract shared by all seven effects."""

    def setUp(self):
        self.img = photo_sim.phantom(120)[:, 10:110]  # not square, to catch swapped axes

    def test_shape_and_dtype_kept(self):
        for name, effect in EFFECTS.items():
            for s in (0.3, 1.0):
                out = effect(self.img, rng(), s)
                with self.subTest(effect=name, strength=s):
                    self.assertEqual(out.shape, self.img.shape)
                    self.assertEqual(out.dtype, np.uint8)

    def test_same_seed_same_output(self):
        for name, effect in EFFECTS.items():
            with self.subTest(effect=name):
                np.testing.assert_array_equal(effect(self.img, rng(7), 1.0), effect(self.img, rng(7), 1.0))

    def test_different_seeds_differ(self):
        for name, effect in EFFECTS.items():
            with self.subTest(effect=name):
                outs = {effect(self.img, rng(s), 1.0).tobytes() for s in range(5)}
                self.assertGreater(len(outs), 1)

    def test_strength_zero_returns_input_as_copy(self):
        for name, effect in EFFECTS.items():
            out = effect(self.img, rng(), 0.0)
            with self.subTest(effect=name):
                np.testing.assert_array_equal(out, self.img)
                self.assertFalse(np.shares_memory(out, self.img))

    def test_full_strength_changes_image(self):
        for name, effect in EFFECTS.items():
            out = effect(self.img, rng(), 1.0)
            with self.subTest(effect=name):
                self.assertGreater(np.abs(out.astype(int) - self.img).mean(), 0.5)

    def test_input_not_changed(self):
        before = self.img.copy()
        for effect in EFFECTS.values():
            effect(self.img, rng(), 1.0)
        np.testing.assert_array_equal(self.img, before)

    def test_output_is_writable(self):
        for name, effect in EFFECTS.items():
            with self.subTest(effect=name):
                self.assertTrue(effect(self.img, rng(), 1.0).flags.writeable)

    def test_bad_input_refused(self):
        for name, effect in EFFECTS.items():
            with self.subTest(effect=name):
                with self.assertRaises(ValueError):
                    effect(self.img.astype(np.float32), rng(), 1.0)
                with self.assertRaises(ValueError):
                    effect(np.stack([self.img] * 3, -1), rng(), 1.0)
                with self.assertRaises(ValueError):
                    effect(self.img, rng(), 1.5)


class EachEffectDoesWhatItSays(unittest.TestCase):

    def test_uneven_light_makes_a_flat_image_uneven(self):
        out = photo_sim.uneven_light(flat(), rng(), 1.0).astype(int)
        self.assertGreater(out.max() - out.min(), 25)
        self.assertLess(np.abs(np.diff(out, axis=1)).max(), 3)  # smooth, no edges

    def test_glare_brightens_a_local_spot_towards_white(self):
        out = photo_sim.glare(flat(100), rng(), 1.0)
        self.assertGreater(out.max(), 200)
        self.assertGreaterEqual(out.min(), 100)  # only adds light
        self.assertLess(np.mean(out > 150), 0.6)  # local, not the whole image

    def test_glare_never_darkens(self):
        img = photo_sim.phantom(64)
        self.assertTrue(np.all(photo_sim.glare(img, rng(3), 1.0) >= img))

    def test_moire_adds_a_fine_periodic_pattern(self):
        out = photo_sim.moire(flat(), rng(), 1.0).astype(np.float32)
        spectrum = np.abs(np.fft.fft2(out - out.mean()))
        peak = np.unravel_index(np.argmax(spectrum), spectrum.shape)
        self.assertNotEqual(peak, (0, 0))
        self.assertGreater(spectrum.max(), 50 * np.median(spectrum))  # sharp peak, not noise
        self.assertLessEqual(np.abs(out - 128).max(), 15)  # faint, as on a real photo

    def test_tilt_shows_the_surround_at_corners_and_keeps_the_centre(self):
        img = flat(128, (100, 100))
        for seed in range(10):
            out = photo_sim.tilt(img, rng(seed), 1.0)
            corner = int(out[0, 0])
            with self.subTest(seed=seed):
                self.assertTrue(corner < 40 or corner >= 200, corner)  # dark room or light box
                self.assertEqual(int(out[50, 50]), 128)

    def test_tilt_surround_is_both_dark_and_bright_across_seeds(self):
        corners = [int(photo_sim.tilt(flat(), rng(s), 1.0)[0, 0]) for s in range(40)]
        self.assertTrue(any(c < 40 for c in corners) and any(c >= 200 for c in corners))

    def test_crop_cuts_the_border_away(self):
        img = flat(50, (100, 100))
        img[:6], img[-6:], img[:, :6], img[:, -6:] = 250, 250, 250, 250  # bright 6 px frame
        out = photo_sim.crop(img, rng(1), 1.0)
        self.assertLess(np.mean(out > 150), np.mean(img > 150))

    def test_blur_removes_fine_detail_both_kinds(self):
        # random texture, not a checkerboard: a diagonal streak keeps a checkerboard intact
        detail = rng(99).integers(0, 256, (96, 96)).astype(np.uint8)
        kinds = set()
        for seed in range(8):
            kinds.add(rng(seed).random() < 0.5)  # the first draw picks Gaussian or motion
            for size in (96, 320):  # small images get the shortest streak (3 px)
                img = detail if size == 96 else np.tile(detail, (4, 4))[:320, :320]
                out = photo_sim.blur(img, rng(seed), 1.0)
                with self.subTest(seed=seed, size=size):
                    self.assertLess(high_freq_energy(out), 0.5 * high_freq_energy(img))
        self.assertEqual(kinds, {True, False})  # Gaussian and motion were both tried

    def test_weak_motion_streak_on_small_image_still_blurs(self):
        # regression: a 2-step streak had offsets -0.5 and 0.5, which round() sent both to 0,
        # so the image came back unchanged. Streaks are now at least 3 steps, floor-rounded.
        detail = rng(1).integers(0, 256, (40, 40)).astype(np.uint8)
        for seed in range(30):
            r = rng(seed)
            if r.random() < 0.5:
                continue  # Gaussian branch
            with self.subTest(seed=seed):
                self.assertFalse(np.array_equal(photo_sim.blur(detail, rng(seed), 0.05), detail))

    def test_jpeg_lower_quality_loses_more(self):
        img = photo_sim.phantom(128)
        img = np.clip(img + rng(0).normal(0, 8, img.shape), 0, 255).astype(np.uint8)  # texture to lose
        err = [np.abs(photo_sim.jpeg(img, rng(), s).astype(int) - img).mean() for s in (0.1, 1.0)]
        self.assertGreater(err[1], err[0])
        self.assertLess(err[1], 20)  # still a chest image


class PhotoSimMix(unittest.TestCase):

    def setUp(self):
        self.img = photo_sim.phantom(96)

    def test_same_seed_same_sequence(self):
        a, b = PhotoSim(seed=3), PhotoSim(seed=3)
        for _ in range(3):
            np.testing.assert_array_equal(a(self.img), b(self.img))

    def test_all_off_returns_input(self):
        sim = PhotoSim(p={name: 0.0 for name in EFFECTS}, seed=0)
        np.testing.assert_array_equal(sim(self.img), self.img)

    def test_zero_max_strength_returns_input(self):
        sim = PhotoSim(p={name: 1.0 for name in EFFECTS}, max_strength=0.0, seed=0)
        np.testing.assert_array_equal(sim(self.img), self.img)

    def test_all_on_changes_image_and_keeps_contract(self):
        before = self.img.copy()
        out = PhotoSim(p={name: 1.0 for name in EFFECTS}, seed=0)(self.img)
        self.assertEqual((out.shape, out.dtype), (self.img.shape, np.uint8))
        self.assertGreater(np.abs(out.astype(int) - self.img).mean(), 1)
        np.testing.assert_array_equal(self.img, before)

    def test_bad_settings_refused(self):
        with self.assertRaises(ValueError):
            PhotoSim(p={"flip": 0.5})  # no such effect (and never a horizontal flip)
        with self.assertRaises(ValueError):
            PhotoSim(max_strength=2.0)

    def test_no_horizontal_flip_effect(self):
        self.assertFalse(any("flip" in name for name in EFFECTS))


class SampleSheet(unittest.TestCase):

    def test_sheet_has_one_row_per_effect_plus_mix(self):
        img = photo_sim.phantom(32)
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "sheet.png"
            names = photo_sim.sample_sheet(img, path)
            sheet = np.asarray(Image.open(path))
        self.assertEqual(len(names), len(EFFECTS) + 1)
        self.assertEqual(sheet.shape, (32 * (len(EFFECTS) + 1), 32 * 4))

    def test_phantom_is_8_bit_grayscale_with_contrast(self):
        p = photo_sim.phantom(64)
        self.assertEqual((p.shape, p.dtype), ((64, 64), np.uint8))
        self.assertGreater(int(p.max()) - int(p.min()), 100)


if __name__ == "__main__":
    unittest.main()
