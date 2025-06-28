# DropShare

**Hyper-Local P2P File Sharing with End-to-End Encryption**

DropShare is a secure, private, and easy-to-use peer-to-peer file sharing application that works entirely in your browser. No servers, no sign-ups, just direct connections for fast and secure file transfers.

## ✨ Features

*   **Peer-to-Peer:** Files are transferred directly between devices without going through a central server.
*   **End-to-End Encrypted:** All files are encrypted using ECDH key exchange with HKDF key derivation and AES-GCM encryption via audited cryptographic libraries (`@noble/*`). See [`SECURITY.md`](./SECURITY.md) for details.
*   **QR Code Connections:** Generate QR codes for easy sharing or scan QR codes to connect to other devices.
*   **Cross-Platform:** Works on any modern browser on any device (desktop, tablet, mobile).
*   **No Installation:** Just open a web page and start sharing.
*   **Multiple File Support:** Share multiple files at once with drag-and-drop support.
*   **Multiple Recipients:** Share files with multiple people simultaneously.
*   **Connection Verification:** Cryptographic challenge-response system ensures secure peer verification.
*   **Dark/Light Theme:** Built-in theme toggle for comfortable use.

## 🚀 Getting Started

To run DropShare locally, follow these steps:

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/daenax/dropshare.git
    cd dropshare
    ```

2.  **Install dependencies:**
    This project uses `bun` as the package manager.
    ```bash
    bun install
    ```

3.  **Run the development server:**
    ```bash
    bun run dev
    ```

4.  Open your browser and navigate to the local URL provided (usually `http://localhost:5173`). To test P2P functionality:
    - On the first device, click "Start Sharing" to generate a QR code
    - On the second device, click "Start Scanning" to scan the QR code and connect
    - Alternatively, you can copy the connection URL and open it directly on the second device

## 📱 How to Use

1. **For Sharing Files:**
   - Click "Start Sharing Files" on the landing page
   - Drag and drop files or click to select files you want to share
   - Show the generated QR code to others or share the connection URL
   - Connected devices will appear in the "Connected Receivers" section

2. **For Receiving Files:**
   - Click "Scan QR Code" on the landing page
   - Point your camera at the sender's QR code
   - Once connected, available files will appear in your list
   - Click the download button on any file to save it to your device

## 🛠️ Tech Stack

*   **Framework:** [React](https://react.dev/) 19 with [Vite](https://vitejs.dev/) 7
*   **Language:** [TypeScript](https://www.typescriptlang.org/)
*   **Package Manager:** [Bun](https://bun.sh/)
*   **P2P Communication:** [PeerJS](https://peerjs.com/) (WebRTC)
*   **Cryptography:** [@noble/curves](https://github.com/paulmillr/noble-curves), [@noble/ciphers](https://github.com/paulmillr/noble-ciphers), [@noble/hashes](https://github.com/paulmillr/noble-hashes)
*   **UI:** [Tailwind CSS](https://tailwindcss.com/) v4 with [shadcn/ui](https://ui.shadcn.com/) components
*   **State Management:** [Zustand](https://zustand-demo.pmnd.rs/)
*   **QR Codes:** `react-qr-code` (generation) and `jsqr` (scanning)
*   **File Handling:** `react-dropzone`
*   **Code Quality:** [Biome](https://biomejs.dev/) for linting and formatting

## 🔒 Security

Security is a core feature of DropShare. All transfers are end-to-end encrypted and authenticated. For a detailed breakdown of the security model, algorithms, and cryptographic libraries used, please read the [`SECURITY.md`](./SECURITY.md) file.

## 🤝 Contributing

Contributions are welcome! Please feel free to open an issue or submit a pull request.

## 📄 License

This project is licensed under the MIT License.
