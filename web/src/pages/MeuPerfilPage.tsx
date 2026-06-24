import { FormEvent, useEffect, useState } from "react";
import { ApiError } from "../api/client";
import { useMe, useUpdateProfile } from "../api/auth";

export function MeuPerfilPage() {
  const { data: me } = useMe();
  const update = useUpdateProfile();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (me) {
      setName(me.name);
      setEmail(me.email);
    }
  }, [me]);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSuccess(false);
    update.mutate(
      {
        name: name !== me?.name ? name : undefined,
        email: email !== me?.email ? email : undefined,
        currentPassword,
        newPassword: newPassword || undefined,
      },
      {
        onSuccess: () => {
          setCurrentPassword("");
          setNewPassword("");
          setSuccess(true);
        },
      },
    );
  }

  const errorMessage = update.error instanceof ApiError ? update.error.message : update.isError ? "Nao foi possivel salvar." : null;

  return (
    <>
      <div className="page-head">
        <h2>Minha conta</h2>
      </div>

      <div className="cards-grid" style={{ maxWidth: 480 }}>
        <div className="card">
          <div className="card-header">
            <span>Dados do perfil</span>
          </div>
          <form onSubmit={handleSubmit} className="form-grid">
            <label className="field full">
              <span>Nome</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                minLength={2}
                maxLength={120}
                required
              />
            </label>
            <label className="field full">
              <span>E-mail</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
            <label className="field full">
              <span>Senha atual <span style={{ color: "#e94560" }}>*</span></span>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </label>
            <label className="field full">
              <span>Nova senha <span style={{ color: "#888", fontWeight: 400 }}>(deixe em branco para manter)</span></span>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                minLength={8}
                maxLength={120}
                autoComplete="new-password"
              />
            </label>
            {errorMessage && <div className="form-error full">{errorMessage}</div>}
            {success && (
              <div className="full" style={{ color: "#166534", background: "#dcfce7", borderRadius: 8, padding: "10px 14px", fontSize: 14 }}>
                Dados atualizados com sucesso!
              </div>
            )}
            <div className="modal-footer full">
              <button type="submit" className="btn-primary" disabled={update.isPending}>
                {update.isPending ? "Salvando..." : "Salvar alterações"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
