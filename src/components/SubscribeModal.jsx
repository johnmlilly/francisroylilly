import { useEffect, useState } from "react";
import Modal from "react-modal";
import SubscribeForm from "./SubscribeForm.jsx";

const STORAGE_KEY = "frl-subscribe-modal-dismissed";
const OPEN_DELAY_MS = 5000;
const CLOSE_AFTER_SUBSCRIBE_MS = 2500;

function dismiss() {
  try {
    localStorage.setItem(STORAGE_KEY, "true");
  } catch {
    // localStorage unavailable (private browsing, etc.) — fail open, no persistence.
  }
}

export default function SubscribeModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [alreadyDismissed, setAlreadyDismissed] = useState(true);

  useEffect(() => {
    let dismissed = true;
    try {
      dismissed = localStorage.getItem(STORAGE_KEY) === "true";
    } catch {
      // localStorage unavailable — treat as not dismissed.
      dismissed = false;
    }
    setAlreadyDismissed(dismissed);

    if (dismissed) return;

    const timer = setTimeout(() => setIsOpen(true), OPEN_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  function handleClose() {
    setIsOpen(false);
    dismiss();
  }

  function handleSubscribed() {
    dismiss();
    setTimeout(() => setIsOpen(false), CLOSE_AFTER_SUBSCRIBE_MS);
  }

  if (alreadyDismissed) return null;

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={handleClose}
      ariaHideApp={false}
      overlayClassName="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      className="bg-white rounded-xl p-6 max-w-md w-full shadow-lg relative outline-none"
    >
      <button
        type="button"
        onClick={handleClose}
        aria-label="Close"
        className="absolute top-3 right-3 text-2xl leading-none text-[rgb(var(--gray-dark))] hover:opacity-70"
      >
        &times;
      </button>
      <h2 className="mb-1">Stay Updated</h2>
      <p className="mb-4 text-sm text-[rgb(var(--gray-dark))]">
        Get new updates about Francis's journey sent straight to your inbox.
      </p>
      <SubscribeForm variant="modal" onSubscribed={handleSubscribed} />
    </Modal>
  );
}
