"""
Self-signed HTTPS server for WebXR AR testing.
Generates cert on first run, then serves dist/ on port 10087.
"""
import http.server
import ssl
import socketserver
import os
import sys
import subprocess

PORT = 10089
CERT_DIR = os.path.dirname(os.path.abspath(__file__))
CERT_FILE = os.path.join(CERT_DIR, "cert.pem")
KEY_FILE = os.path.join(CERT_DIR, "key.pem")

def generate_cert():
    """Generate self-signed cert using Python's ssl module or openssl."""
    if os.path.exists(CERT_FILE) and os.path.exists(KEY_FILE):
        print("Certificate already exists")
        return True
    
    # Try using cryptography library
    try:
        from cryptography import x509
        from cryptography.x509.oid import NameOID
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import rsa
        from datetime import datetime, timedelta
        
        print("Generating self-signed certificate with cryptography...")
        
        key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        
        subject = issuer = x509.Name([
            x509.NameAttribute(NameOID.COUNTRY_NAME, "CN"),
            x509.NameAttribute(NameOID.STATE_OR_PROVINCE_NAME, "Dev"),
            x509.NameAttribute(NameOID.LOCALITY_NAME, "Local"),
            x509.NameAttribute(NameOID.ORGANIZATION_NAME, "BlackHole-AR"),
            x509.NameAttribute(NameOID.COMMON_NAME, "192.168.20.160"),
        ])
        
        now = datetime.utcnow()
        cert = (
            x509.CertificateBuilder()
            .subject_name(subject)
            .issuer_name(issuer)
            .public_key(key.public_key())
            .serial_number(x509.random_serial_number())
            .not_valid_before(now - timedelta(days=1))
            .not_valid_after(now + timedelta(days=365))
            .add_extension(
                x509.SubjectAlternativeName([
                    x509.IPAddress(ipaddress.ip_address("192.168.20.160")),
                    x509.IPAddress(ipaddress.ip_address("127.0.0.1")),
                    x509.DNSName("localhost"),
                ]),
                critical=False,
            )
            .sign(key, hashes.SHA256())
        )
        
        with open(CERT_FILE, "wb") as f:
            f.write(cert.public_bytes(serialization.Encoding.PEM))
        with open(KEY_FILE, "wb") as f:
            f.write(key.private_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PrivateFormat.TraditionalOpenSSL,
                encryption_algorithm=serialization.NoEncryption(),
            ))
        
        print(f"Certificate generated: {CERT_FILE}")
        return True
    except ImportError:
        pass
    
    # Fallback: use node to generate
    print("Trying node-based cert generation...")
    try:
        node_script = """
const crypto = require('crypto');
const fs = require('fs');
const key = crypto.generateKeyPairSync('rsa', { modulusLength: 2048, publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
const cert = crypto.Certificate();
console.log('node crypto available but cannot easily create x509 without extra libs');
process.exit(1);
"""
        result = subprocess.run(["node", "-e", node_script], capture_output=True, text=True)
    except Exception as e:
        print(f"Node fallback failed: {e}")
    
    # Last resort: use npx mkcert or similar
    print("\n=== Cannot auto-generate certificate ===")
    print("Please run one of these:")
    print("  pip install cryptography   # then restart this script")
    print("  # OR install mkcert:")
    print("  choco install mkcert && mkcert -install && mkcert localhost 127.0.0.1 192.168.20.160")
    return False

# Need ipaddress for SAN extension
import ipaddress

if not generate_cert():
    sys.exit(1)

os.chdir(os.path.join(CERT_DIR, "dist"))

class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # CORS headers for local dev
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()
    
    def log_message(self, format, *args):
        print(f"  [{self.log_date_time_string()}] {format % args}")

ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
ctx.load_cert_chain(CERT_FILE, KEY_FILE)

with socketserver.TCPServer(("0.0.0.0", PORT), Handler) as httpd:
    httpd.socket = ctx.wrap_socket(httpd.socket, server_side=True)
    print(f"\n{'='*50}")
    print(f"  HTTPS Server running!")
    print(f"  Local:  https://localhost:{PORT}/")
    print(f"  LAN:   https://192.168.20.160:{PORT}/")
    print(f"\n  On phone (first time):")
    print(f"  1. Open https://192.168.20.160:{PORT}/ar-minimal.html")
    print(f"  2. Browser will show certificate warning -> click Advanced -> Proceed anyway")
    print(f"{'='*50}\n")
    httpd.serve_forever()
