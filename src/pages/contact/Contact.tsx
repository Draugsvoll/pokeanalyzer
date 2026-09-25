import { useLayoutEffect } from "react";
import { SUPPORT_EMAIL, SUPPORT_EMAIL_LINK } from "../../config/site";
import "./Contact.scss";

export default function Contact() {
  useLayoutEffect(() => {
    window.scrollTo({ behavior: "instant", left: 0, top: 0 });
  }, []);

  return (
    <main className="contact-page default-container">
      <header className="contact-page__header">
        <span className="app-subheader">Support</span>
        <h1>Contact Us</h1>
        <p>
          For account and billing support, card data corrections, general
          inquiries, or feedback, contact us by email.
        </p>
      </header>

      <section className="contact-page__method">
        <h2>Support email</h2>
        <a href={SUPPORT_EMAIL_LINK}>{SUPPORT_EMAIL}</a>
      </section>
    </main>
  );
}
