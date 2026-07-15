import Button from "../button/Button";
import "./GoogleLoginButton.scss";

type GoogleLoginButtonProps = {
  disabled?: boolean;
  onClick: () => void;
};

export function GoogleLoginButton({ disabled, onClick }: GoogleLoginButtonProps) {
  return (
    <Button className="google-login-button" disabled={disabled} onClick={onClick}>
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path fill="#4285f4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.06H12v3.89h5.38a4.6 4.6 0 0 1-2 3.02v2.52h3.24c1.9-1.75 2.98-4.32 2.98-7.37Z" />
        <path fill="#34a853" d="M12 22c2.7 0 4.98-.9 6.63-2.4l-3.24-2.52c-.9.6-2.05.96-3.39.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.6A10 10 0 0 0 12 22Z" />
        <path fill="#fbbc05" d="M6.39 13.91A6 6 0 0 1 6.08 12c0-.66.11-1.3.31-1.91v-2.6H3.04A10 10 0 0 0 2 12c0 1.61.39 3.14 1.04 4.51l3.35-2.6Z" />
        <path fill="#ea4335" d="M12 5.96c1.47 0 2.79.5 3.83 1.5l2.87-2.88A9.64 9.64 0 0 0 12 2a10 10 0 0 0-8.96 5.49l3.35 2.6C7.18 7.72 9.39 5.96 12 5.96Z" />
      </svg>
      <span>Continue with Google</span>
    </Button>
  );
}
