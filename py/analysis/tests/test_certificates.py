import os
import subprocess
import sys


def test_downloads_trust_the_bundled_certificates():
    # On Windows the system store can lack an authority GitHub needs: the matte model then looked like "no internet".
    env = {k: v for k, v in os.environ.items() if k != "SSL_CERT_FILE"}
    out = subprocess.run([sys.executable, "-c", "import os, adam_analysis, certifi; print(os.environ['SSL_CERT_FILE'] == certifi.where())"],
                         capture_output=True, text=True, env=env)
    assert out.stdout.strip() == "True", out.stderr


def test_a_certificate_file_set_by_the_creator_stays():
    env = {**os.environ, "SSL_CERT_FILE": "mine.pem"}
    out = subprocess.run([sys.executable, "-c", "import os, adam_analysis; print(os.environ['SSL_CERT_FILE'])"], capture_output=True, text=True, env=env)
    assert out.stdout.strip() == "mine.pem", out.stderr
