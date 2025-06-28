# DropShare

**Hyper-Local P2P File Sharing with End-to-End Encryption**

DropShare is a secure, private, and easy-to-use peer-to-peer file sharing application that works entirely in your browser. No servers, no sign-ups, just direct connections for fast and secure file transfers.

## ✨ Features

*   **Peer-to-Peer:** Files are transferred directly between devices without going through a central server.
*   **End-to-End Encrypted:** All files are encrypted in the browser using audited cryptographic libraries (`@noble/*`) before being sent. See [`SECURITY.md`](./SECURITY.md) for details.
*   **QR Code Connections:** Easily connect two devices by scanning a QR code.
*   **Cross-Platform:** Works on any modern browser on any device (desktop, tablet, mobile).
*   **No Installation:** Just open a web page.
*   **Multiple File Support:** Share multiple files at once.
*   **Multiple Recipients:** Share files with multiple people simultaneously.

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

4.  Open your browser and navigate to the local URL provided (usually `http://localhost:5173`). To test P2P functionality, you'll need to open it on two different devices or in two separate browser profiles.

## 🛠️ Tech Stack

*   **Framework:** [React](https://react.dev/) with [Vite](https://vitejs.dev/)
*   **Language:** [TypeScript](https://www.typescriptlang.org/)
*   **P2P Communication:** [PeerJS](https://peerjs.com/) (WebRTC)
*   **Cryptography:** [@noble/curves](https://github.com/paulmillr/noble-curves), [@noble/ciphers](https://github.com/paulmillr/noble-ciphers), [@noble/hashes](https://github.com/paulmillr/noble-hashes)
*   **UI:** [Tailwind CSS](https://tailwindcss.com/) with [shadcn/ui](https://ui.shadcn.com/) components
*   **QR Codes:** `react-qr-code`
*   **File Handling:** `react-dropzone`

## 🔒 Security

Security is a core feature of DropShare. All transfers are end-to-end encrypted and authenticated. For a detailed breakdown of the security model, algorithms, and cryptographic libraries used, please read the [`SECURITY.md`](./SECURITY.md) file.

## 🤝 Contributing

Contributions are welcome! Please feel free to open an issue or submit a pull request.

## 📄 License

This project is licensed under the MIT License.
