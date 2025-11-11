import { useState } from "react";
import { Forward } from "lucide-react";

export default function ShareButton() {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
  onClick={handleCopy}
  class="flex items-center gap-1 bg-white rounded-lg px-4 py-3 shadow-sm border border-gray-100 w-fit mb-4 hover:bg-gray-50 transition"
>
  <Forward size={21} /> {copied ? "Copied!" : "Share"}
</button>
  );
}
