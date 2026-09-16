import { useRef, useState } from "react";

const BUTTONDOWN_ENDPOINT =
  "https://buttondown.com/api/emails/embed-subscribe/johnmlilly";

const inputClass =
  "w-full rounded-lg border border-[rgba(96,115,159,0.3)] px-3 py-2 text-base focus:outline-none focus:ring-1 focus:ring-[var(--secondary-color)]";

const variantWrapperClass = {
  page: "max-w-md mx-auto",
  inline: "max-w-md",
  modal: "",
};

export default function SubscribeForm({ variant = "page", onSubscribed = () => {} }) {
  const formRef = useRef(null);
  const [status, setStatus] = useState("idle");

  async function handleSubmit(e) {
    e.preventDefault();
    if (status === "submitting") return;

    setStatus("submitting");
    const form = formRef.current;
    const formData = new FormData(form);

    try {
      // Buttondown's embed endpoint sends no CORS headers, so the response
      // is opaque under no-cors — a resolved fetch is the only signal we get.
      await fetch(BUTTONDOWN_ENDPOINT, {
        method: "POST",
        body: formData,
        mode: "no-cors",
      });
      setStatus("success");
      form.reset();
      onSubscribed();
    } catch {
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <div className={variantWrapperClass[variant]}>
        <div className="rounded-lg bg-green-100 px-4 py-3 text-sm text-green-700">
          Thanks for subscribing! Check your inbox to confirm.
        </div>
      </div>
    );
  }

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      className={`${variantWrapperClass[variant]} flex flex-col gap-3 m-auto`}
    >
      {status === "error" && (
        <div className="rounded-lg bg-red-100 px-4 py-3 text-sm text-red-700">
          Something went wrong. Please try again.
        </div>
      )}

      {/* first_name/last_name only persist once matching custom fields
          are added in the Buttondown dashboard's subscriber settings. */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="flex-1">
          <label htmlFor="subscribe-first-name" className="sr-only">
            First name
          </label>
          <input
            type="text"
            id="subscribe-first-name"
            name="first_name"
            placeholder="First name"
            className={inputClass}
          />
        </div>
        <div className="flex-1">
          <label htmlFor="subscribe-last-name" className="sr-only">
            Last name
          </label>
          <input
            type="text"
            id="subscribe-last-name"
            name="last_name"
            placeholder="Last name"
            className={inputClass}
          />
        </div>
      </div>

      <div>
        <label htmlFor="subscribe-email" className="sr-only">
          Email
        </label>
        <input
          type="email"
          id="subscribe-email"
          name="email"
          required
          placeholder="Email address"
          className={inputClass}
        />
      </div>

      <button
        type="submit"
        disabled={status === "submitting"}
        className="rounded-lg bg-[var(--primary-color)] px-4 py-2 font-semibold text-white transition-opacity hover:opacity-80 disabled:opacity-50"
      >
        {status === "submitting" ? "Subscribing..." : "Subscribe"}
      </button>
    </form>
  );
}
