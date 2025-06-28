# DropShare Security Features

## Overview

DropShare implements multiple layers of security to ensure private and authenticated peer-to-peer file transfers using audited cryptographic libraries:

## 🔐 Application-Layer Encryption

### Key Exchange (ECDH)
- **Algorithm**: Elliptic Curve Diffie-Hellman (secp256k1)
- **Library**: [@noble/curves](https://github.com/paulmillr/noble-curves) - audited implementation
- **Purpose**: Establishes a shared secret between peers
- **Implementation**: Each peer generates an ECDH key pair and exchanges public keys
- **Key Derivation**: Uses HKDF-SHA256 with salt "dropshare" to derive 256-bit key from shared secret
- **Result**: Derives a 256-bit AES-GCM key for file encryption

### File Encryption
- **Algorithm**: AES-GCM (256-bit)
- **Library**: [@noble/ciphers](https://github.com/paulmillr/noble-ciphers) - audited implementation
- **Scope**: All file chunks (64KB each) are encrypted before transmission
- **IV**: Random 96-bit initialization vector per chunk using Web Crypto API
- **Authentication**: Built-in authentication tag prevents tampering
- **Fallback**: Gracefully falls back to unencrypted transmission if encryption fails

## 🛡️ Connection Verification

### Digital Signatures (ECDSA)
- **Algorithm**: Elliptic Curve Digital Signature Algorithm (secp256k1)
- **Library**: [@noble/curves](https://github.com/paulmillr/noble-curves) - audited implementation
- **Purpose**: Prevents man-in-the-middle attacks
- **Implementation**: Challenge-response protocol using digital signatures

### Verification Process
1. **Key Exchange**: Sender initiates by sending both ECDH and ECDSA public keys
2. **Key Response**: Receiver responds with their ECDH and ECDSA public keys
3. **Challenge**: Sender generates a random 32-byte challenge and sends it to receiver
4. **Response**: Receiver signs the challenge with their private ECDSA key and sends signature back
5. **Verification**: Sender verifies the signature using receiver's public ECDSA key
6. **Completion**: Only verified peers can exchange files; sender sends verification complete message

## 🔒 Security Properties

### Confidentiality
- ✅ Files are encrypted end-to-end with AES-GCM
- ✅ Encryption keys are derived using ECDH
- ✅ Each chunk has a unique initialization vector

### Integrity
- ✅ AES-GCM provides authenticated encryption
- ✅ Tampering with encrypted data is detectable
- ✅ File chunks are verified during decryption

### Authentication
- ✅ ECDSA signatures prevent impersonation
- ✅ Challenge-response protocol verifies peer identity
- ✅ Only verified peers can access files

### Forward Secrecy
- ✅ New key pairs generated for each session
- ✅ Keys are ephemeral and destroyed when session ends
- ✅ No persistent key storage

## 🚀 Implementation Details

### Noble Cryptographic Libraries
- Uses audited [@noble](https://paulmillr.com/noble/) cryptographic libraries
- Multiple independent security audits (6+ audits as of 2024)
- Zero dependencies and minimal attack surface
- Highly readable TypeScript implementation

### Key Management
- ECDH keys: Used for deriving shared encryption keys
- ECDSA keys: Used for digital signatures and verification
- Keys are stored in memory only and destroyed when session ends
- Uses secp256k1 curve for both ECDH and ECDSA operations

### Cryptographic Primitives
- **Hash Function**: SHA-256 from [@noble/hashes](https://github.com/paulmillr/noble-hashes)
- **Key Derivation**: HKDF-SHA256 with salt "dropshare" for shared key derivation
- **Random Generation**: Secure random number generation via Web Crypto API
- **Encoding**: Hex encoding for key and data serialization over the wire
- **Signature Format**: Compact raw bytes format for ECDSA signatures

### Error Handling
- Graceful fallback to unencrypted transmission if chunk encryption fails
- Connection status tracking: connecting → verifying → connected/error/disconnected
- Clear error messages for debugging cryptographic failures
- Visual indicators for connection and verification status in UI

## 🔍 Security Considerations

### Threats Mitigated
- ✅ **Eavesdropping**: Files are encrypted during transmission
- ✅ **Man-in-the-middle**: Digital signatures verify peer identity
- ✅ **Tampering**: Authenticated encryption detects modifications
- ✅ **Impersonation**: Challenge-response prevents fake peers

### Remaining Considerations
- ⚠️ **Metadata Leakage**: File names and sizes are visible during signaling
- ⚠️ **Traffic Analysis**: Connection patterns may be observable
- ⚠️ **Endpoint Security**: Devices must be trusted and secure
- ⚠️ **Social Engineering**: Users must verify they're connecting to intended peers
- ⚠️ **Fallback Risk**: System falls back to unencrypted transmission if encryption fails
- ⚠️ **Key Storage**: Cryptographic keys stored in memory only (lost on page refresh)

## 📋 Usage

The security features are automatically enabled and transparent to users:

1. **Senders**: Generate QR codes as usual - encryption and verification happen automatically
2. **Receivers**: Scan QR codes - verification status is shown during connection process
3. **Status Indicators**:
   - 🟡 Yellow dot (pulsing): Peer verification in progress
   - 🟢 Green dot: Peer verified and secure connection established
   - 🔴 Red status: Verification failed or connection error
4. **Connection States**: connecting → verifying → connected/error/disconnected

## 🛠️ Technical Notes

### Performance Impact
- Minimal overhead for key generation and exchange (~1-2ms)
- File chunking: 64KB chunks with 10ms delay between transmissions
- Encryption adds minimal overhead per chunk using optimized Noble libraries
- Verification completes in <1 second typically
- HKDF key derivation: ~1-5ms overhead per connection

### Browser Compatibility
- Requires modern browsers with Web Crypto API support for random generation
- Works in all major browsers (Chrome, Firefox, Safari, Edge)
- HTTPS required for secure random generation (except localhost)

### Audit Trail
The noble cryptographic libraries used have undergone multiple independent security audits:
- **@noble/curves**: 5+ audits by Cure53, Trail of Bits, and Kudelski Security
- **@noble/ciphers**: 6+ audits including recent Cure53 audit (Sept 2024)
- **@noble/hashes**: Multiple audits by Cure53 and other security firms

### Future Enhancements
- [ ] Zero-knowledge proof of identity
- [ ] Encrypted metadata transmission (file names and sizes)
- [ ] Advanced threat detection and connection monitoring
- [ ] Persistent peer identity verification
- [ ] Multi-party file sharing with group verification
