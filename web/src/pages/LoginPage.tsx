import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useLogin } from "../api/auth";
import { ApiError } from "../api/client";

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const login = useLogin();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    login.mutate(
      { email, password },
      {
        onSuccess: () => navigate("/painel", { replace: true }),
        onError: (err) => {
          setError(err instanceof ApiError ? err.message : "Não foi possível entrar. Tente novamente.");
        },
      },
    );
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="brand">
          <img src="/logo.svg" alt="FluxoCaixa" className="brand-logo" />
          FluxoCaixa
        </div>
        <div className="brand-sub">Controle financeiro da sua empresa</div>
        {error && <div className="form-error">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="email">E-mail</label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="password">Senha</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>
          <button type="submit" className="btn-primary" disabled={login.isPending}>
            {login.isPending ? "Entrando…" : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}
