from cryptography.hazmat.primitives.serialization import pkcs12, NoEncryption
from cryptography.hazmat.primitives.serialization import load_pem_private_key
from cryptography import x509

with open('key.pem', 'rb') as f:
    key = load_pem_private_key(f.read(), password=None)
with open('cert.pem', 'rb') as f:
    cert = x509.load_pem_x509_certificate(f.read())

p12 = pkcs12.serialize_key_and_certificates(
    name=b'AR Dev',
    key=key,
    cert=cert,
    cas=None,
    encryption_algorithm=NoEncryption()
)
with open('dist/ar-dev.p12', 'wb') as f:
    f.write(p12)
print('OK: dist/ar-dev.p12 created')
