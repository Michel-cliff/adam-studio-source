"""Adam Studio analysis: python -m adam_analysis run <projectDir> --video c01=<path> --steps edit,proxy,..."""

import os

# Downloads (the matte and inpainting models) go through Python's own HTTPS: on Windows the system store can lack an
# authority GitHub needs, and the failure reads "no internet connection". The bundled certificates always have it.
try:
    import certifi

    os.environ.setdefault("SSL_CERT_FILE", certifi.where())
except ImportError:
    pass
