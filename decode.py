import json, base64

def decode_submission(encoded: str, key: str = "py-exercise") -> dict:
    key_bytes = key.encode("utf-8")
    xored     = base64.b64decode(encoded)
    raw       = bytes(b ^ key_bytes[i % len(key_bytes)] for i, b in enumerate(xored))
    return json.loads(raw.decode("utf-8"))

key = input("Enter the quarto quiz key: ")
enc_string = input("Enter the encoded submission string: ")
data = decode_submission(enc_string, key=key)

print(json.dumps(data,indent=4))
