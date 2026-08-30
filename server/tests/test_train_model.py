"""Unit tests for the price model training module.

Run:  cd server && python -m pytest tests/test_train_model.py -q
"""
import os
import tempfile
import json
import pickle
import math
import sys

import pytest
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import train_model


class TestConstants:
    """Tests for module constants and configuration."""

    def test_crops_defined(self):
        """Verify CROPS dictionary is properly configured."""
        assert len(train_model.CROPS) == 10
        assert train_model.CROPS["tomato"] == (1800, 80)
        assert train_model.CROPS["wheat"] == (2300, 140)
        assert train_model.CROPS["rice"] == (2100, 190)
        assert train_model.CROPS["cotton"] == (7000, 240)

    def test_mandis_defined(self):
        """Verify MANDIS dictionary is properly configured."""
        assert len(train_model.MANDIS) == 7
        assert train_model.MANDIS["Azadpur"] == (148, 920, 1.18)
        assert train_model.MANDIS["Vashi APMC"] == (212, 780, 1.22)

    def test_coef_defined(self):
        """Verify COEF dictionary contains expected keys."""
        expected_keys = ["quality", "grade_a", "grade_c", "arrivals", "demand",
                        "seasonality", "fuel", "distance", "moisture", "festival"]
        assert set(train_model.COEF.keys()) == set(expected_keys)
        assert train_model.COEF["quality"] == 0.0042
        assert train_model.COEF["grade_a"] == 0.085

    def test_features_order(self):
        """Verify FEATURES list is correct and complete."""
        assert len(train_model.FEATURES) == 11
        assert train_model.FEATURES[0] == "quality_score"
        assert train_model.FEATURES[1] == "grade_a"
        assert train_model.FEATURES[2] == "grade_c"
        assert train_model.FEATURES[-1] == "ref_price"


class TestCSVGeneration:
    """Tests for CSV data generation."""

    def test_generate_csv_creates_file(self):
        """Test that generate_csv creates a CSV file with correct structure."""
        with tempfile.TemporaryDirectory() as tmpdir:
            csv_path = os.path.join(tmpdir, "test.csv")
            original_csv = train_model.CSV_PATH
            original_data = train_model.DATA
            train_model.CSV_PATH = csv_path
            train_model.DATA = tmpdir

            try:
                train_model.generate_csv(rows=100, seed=42)
                assert os.path.exists(csv_path)

                with open(csv_path) as f:
                    lines = f.readlines()
                    assert len(lines) == 101  # header + 100 rows
                    assert "date,crop,mandi" in lines[0]
            finally:
                train_model.CSV_PATH = original_csv
                train_model.DATA = original_data

    def test_generate_csv_reproducible(self):
        """Test that generate_csv produces same output with same seed."""
        with tempfile.TemporaryDirectory() as tmpdir:
            csv1 = os.path.join(tmpdir, "test1.csv")
            csv2 = os.path.join(tmpdir, "test2.csv")
            original_csv = train_model.CSV_PATH
            original_data = train_model.DATA

            try:
                train_model.CSV_PATH = csv1
                train_model.DATA = tmpdir
                train_model.generate_csv(rows=50, seed=123)
                with open(csv1) as f:
                    data1 = f.read()

                train_model.CSV_PATH = csv2
                train_model.generate_csv(rows=50, seed=123)
                with open(csv2) as f:
                    data2 = f.read()

                assert data1 == data2
            finally:
                train_model.CSV_PATH = original_csv
                train_model.DATA = original_data

    def test_generate_csv_header_format(self):
        """Test CSV header contains all expected columns."""
        with tempfile.TemporaryDirectory() as tmpdir:
            csv_path = os.path.join(tmpdir, "test.csv")
            original_csv = train_model.CSV_PATH
            original_data = train_model.DATA
            train_model.CSV_PATH = csv_path
            train_model.DATA = tmpdir

            try:
                train_model.generate_csv(rows=10, seed=42)
                with open(csv_path) as f:
                    header = f.readline().strip()
                    expected_cols = ["date", "crop", "mandi", "distance_km", "arrivals_t",
                                   "demand_index", "quality_score", "grade", "moisture_pct",
                                   "fuel_index", "festival", "modal_price"]
                    assert all(col in header for col in expected_cols)
            finally:
                train_model.CSV_PATH = original_csv
                train_model.DATA = original_data

    def test_generate_csv_data_quality(self):
        """Test that generated data has realistic values."""
        with tempfile.TemporaryDirectory() as tmpdir:
            csv_path = os.path.join(tmpdir, "test.csv")
            original_csv = train_model.CSV_PATH
            original_data = train_model.DATA
            train_model.CSV_PATH = csv_path
            train_model.DATA = tmpdir

            try:
                train_model.generate_csv(rows=50, seed=42)
                import csv
                with open(csv_path, newline="") as f:
                    reader = csv.DictReader(f)
                    for row in reader:
                        # Quality should be between 12 and 99
                        quality = float(row["quality_score"])
                        assert 12 <= quality <= 99
                        # Grade should be A, B, or C
                        assert row["grade"] in ("A", "B", "C")
                        # Moisture should be positive
                        assert float(row["moisture_pct"]) > 0
                        # Price should be positive
                        assert float(row["modal_price"]) > 0
            finally:
                train_model.CSV_PATH = original_csv
                train_model.DATA = original_data


class TestLoadCSV:
    """Tests for CSV loading and feature engineering."""

    def test_load_csv_returns_arrays(self):
        """Test that load_csv returns proper numpy arrays."""
        with tempfile.TemporaryDirectory() as tmpdir:
            csv_path = os.path.join(tmpdir, "test.csv")
            original_csv = train_model.CSV_PATH
            original_data = train_model.DATA
            train_model.CSV_PATH = csv_path
            train_model.DATA = tmpdir

            try:
                train_model.generate_csv(rows=50, seed=42)
                X, y = train_model.load_csv()

                assert isinstance(X, np.ndarray)
                assert isinstance(y, np.ndarray)
                assert X.shape == (50, 11)  # 50 rows, 11 features
                assert y.shape == (50,)
            finally:
                train_model.CSV_PATH = original_csv
                train_model.DATA = original_data

    def test_load_csv_feature_engineering(self):
        """Test that load_csv correctly engineers features."""
        with tempfile.TemporaryDirectory() as tmpdir:
            csv_path = os.path.join(tmpdir, "test.csv")
            original_csv = train_model.CSV_PATH
            original_data = train_model.DATA
            train_model.CSV_PATH = csv_path
            train_model.DATA = tmpdir

            try:
                train_model.generate_csv(rows=50, seed=42)
                X, y = train_model.load_csv()

                # Check quality_score range
                assert np.all(X[:, 0] >= 12)  # quality_score
                assert np.all(X[:, 0] <= 99)

                # Check grade_a and grade_c are binary
                assert np.all(np.isin(X[:, 1], [0.0, 1.0]))  # grade_a
                assert np.all(np.isin(X[:, 2], [0.0, 1.0]))  # grade_c

                # Check that y (log prices) are reasonable
                assert np.all(np.isfinite(y))
                assert len(y) == 50
            finally:
                train_model.CSV_PATH = original_csv
                train_model.DATA = original_data

    def test_load_csv_grade_encoding(self):
        """Test that grades are correctly encoded as binary features."""
        with tempfile.TemporaryDirectory() as tmpdir:
            csv_path = os.path.join(tmpdir, "test.csv")
            original_csv = train_model.CSV_PATH
            original_data = train_model.DATA
            train_model.CSV_PATH = csv_path
            train_model.DATA = tmpdir

            try:
                train_model.generate_csv(rows=30, seed=42)
                X, y = train_model.load_csv()

                # For each row, check that grade encoding makes sense
                for i in range(len(X)):
                    grade_a = X[i, 1]
                    grade_c = X[i, 2]
                    # Only one grade should be 1 (grade A or C), or both 0 (grade B)
                    assert grade_a + grade_c <= 1
            finally:
                train_model.CSV_PATH = original_csv
                train_model.DATA = original_data

    def test_load_csv_ref_price_included(self):
        """Test that reference crop prices are included as features."""
        with tempfile.TemporaryDirectory() as tmpdir:
            csv_path = os.path.join(tmpdir, "test.csv")
            original_csv = train_model.CSV_PATH
            original_data = train_model.DATA
            train_model.CSV_PATH = csv_path
            train_model.DATA = tmpdir

            try:
                train_model.generate_csv(rows=30, seed=42)
                X, y = train_model.load_csv()

                # Last feature should be ref_price (10th index)
                ref_prices = X[:, 10]
                # All ref_prices should be in our CROPS list
                valid_refs = [price for price, _ in train_model.CROPS.values()]
                assert np.all(np.isin(ref_prices, valid_refs))
            finally:
                train_model.CSV_PATH = original_csv
                train_model.DATA = original_data


class TestMain:
    """Tests for the main training function."""

    def test_main_creates_model_file(self):
        """Test that main() creates the pickle model file."""
        with tempfile.TemporaryDirectory() as tmpdir:
            csv_path = os.path.join(tmpdir, "test.csv")
            pkl_path = os.path.join(tmpdir, "model.pkl")
            original_csv = train_model.CSV_PATH
            original_pkl = train_model.PKL_PATH
            original_data = train_model.DATA
            original_models = train_model.MODELS

            train_model.CSV_PATH = csv_path
            train_model.PKL_PATH = pkl_path
            train_model.DATA = tmpdir
            train_model.MODELS = tmpdir

            try:
                train_model.main()
                assert os.path.exists(pkl_path)
            finally:
                train_model.CSV_PATH = original_csv
                train_model.PKL_PATH = original_pkl
                train_model.DATA = original_data
                train_model.MODELS = original_models

    def test_main_creates_metadata_file(self):
        """Test that main() creates the metadata JSON file."""
        with tempfile.TemporaryDirectory() as tmpdir:
            csv_path = os.path.join(tmpdir, "test.csv")
            pkl_path = os.path.join(tmpdir, "model.pkl")
            json_path = os.path.join(tmpdir, "price_model_meta.json")
            original_csv = train_model.CSV_PATH
            original_pkl = train_model.PKL_PATH
            original_data = train_model.DATA
            original_models = train_model.MODELS

            train_model.CSV_PATH = csv_path
            train_model.PKL_PATH = pkl_path
            train_model.DATA = tmpdir
            train_model.MODELS = tmpdir

            try:
                train_model.main()
                assert os.path.exists(json_path)
            finally:
                train_model.CSV_PATH = original_csv
                train_model.PKL_PATH = original_pkl
                train_model.DATA = original_data
                train_model.MODELS = original_models

    def test_main_model_bundle_structure(self):
        """Test that the saved model bundle has expected structure."""
        with tempfile.TemporaryDirectory() as tmpdir:
            csv_path = os.path.join(tmpdir, "test.csv")
            pkl_path = os.path.join(tmpdir, "model.pkl")
            original_csv = train_model.CSV_PATH
            original_pkl = train_model.PKL_PATH
            original_data = train_model.DATA
            original_models = train_model.MODELS

            train_model.CSV_PATH = csv_path
            train_model.PKL_PATH = pkl_path
            train_model.DATA = tmpdir
            train_model.MODELS = tmpdir

            try:
                train_model.main()

                with open(pkl_path, "rb") as f:
                    bundle = pickle.load(f)

                assert "model" in bundle
                assert "features" in bundle
                assert "crops" in bundle
                assert "residual_sigma" in bundle
                assert "metrics" in bundle
                assert "version" in bundle
                assert "algo" in bundle
                assert bundle["version"] == "2.3.0"
            finally:
                train_model.CSV_PATH = original_csv
                train_model.PKL_PATH = original_pkl
                train_model.DATA = original_data
                train_model.MODELS = original_models

    def test_main_model_bundle_metrics(self):
        """Test that metrics in bundle are reasonable."""
        with tempfile.TemporaryDirectory() as tmpdir:
            csv_path = os.path.join(tmpdir, "test.csv")
            pkl_path = os.path.join(tmpdir, "model.pkl")
            original_csv = train_model.CSV_PATH
            original_pkl = train_model.PKL_PATH
            original_data = train_model.DATA
            original_models = train_model.MODELS

            train_model.CSV_PATH = csv_path
            train_model.PKL_PATH = pkl_path
            train_model.DATA = tmpdir
            train_model.MODELS = tmpdir

            try:
                train_model.main()

                with open(pkl_path, "rb") as f:
                    bundle = pickle.load(f)

                metrics = bundle["metrics"]
                # R² should be between 0 and 1
                assert 0 <= metrics["r2"] <= 1
                # MAPE should be positive
                assert metrics["mape"] >= 0
                # Should have reasonable sample counts
                assert metrics["n_train"] > 0
                assert metrics["n_test"] > 0
                assert metrics["n_train"] + metrics["n_test"] == 18240
            finally:
                train_model.CSV_PATH = original_csv
                train_model.PKL_PATH = original_pkl
                train_model.DATA = original_data
                train_model.MODELS = original_models

    def test_main_features_match_constant(self):
        """Test that saved features match the FEATURES constant."""
        with tempfile.TemporaryDirectory() as tmpdir:
            csv_path = os.path.join(tmpdir, "test.csv")
            pkl_path = os.path.join(tmpdir, "model.pkl")
            original_csv = train_model.CSV_PATH
            original_pkl = train_model.PKL_PATH
            original_data = train_model.DATA
            original_models = train_model.MODELS

            train_model.CSV_PATH = csv_path
            train_model.PKL_PATH = pkl_path
            train_model.DATA = tmpdir
            train_model.MODELS = tmpdir

            try:
                train_model.main()

                with open(pkl_path, "rb") as f:
                    bundle = pickle.load(f)

                assert bundle["features"] == train_model.FEATURES
                assert bundle["crops"] == train_model.CROPS
            finally:
                train_model.CSV_PATH = original_csv
                train_model.PKL_PATH = original_pkl
                train_model.DATA = original_data
                train_model.MODELS = original_models

    def test_main_residual_sigma_positive(self):
        """Test that residual_sigma is positive and reasonable."""
        with tempfile.TemporaryDirectory() as tmpdir:
            csv_path = os.path.join(tmpdir, "test.csv")
            pkl_path = os.path.join(tmpdir, "model.pkl")
            original_csv = train_model.CSV_PATH
            original_pkl = train_model.PKL_PATH
            original_data = train_model.DATA
            original_models = train_model.MODELS

            train_model.CSV_PATH = csv_path
            train_model.PKL_PATH = pkl_path
            train_model.DATA = tmpdir
            train_model.MODELS = tmpdir

            try:
                train_model.main()

                with open(pkl_path, "rb") as f:
                    bundle = pickle.load(f)

                assert bundle["residual_sigma"] > 0
                assert bundle["residual_sigma"] < 1  # log-space residuals
            finally:
                train_model.CSV_PATH = original_csv
                train_model.PKL_PATH = original_pkl
                train_model.DATA = original_data
                train_model.MODELS = original_models
