import { FormEvent, useState } from "react";
import { ApiError } from "../api/client";
import { useIsAdmin } from "../api/auth";
import { useMe } from "../api/auth";
import { useChangeUserRole, useCreateUser, useUsers } from "../api/users";

export function UsersPage() {
  const { data: me } = useMe();
  const isAdmin = useIsAdmin();
  const { data: users, isError, isLoading } = useUsers();
  const createUser = useCreateUser();
  const changeRole = useChangeUserRole();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"ADMIN" | "OPERATOR">("OPERATOR");

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    createUser.mutate(
      { name, email, password, role },
      {
        onSuccess: () => {
          setName("");
          setEmail("");
          setPassword("");
          setRole("OPERATOR");
        },
      },
    );
  }

  const errorMessage =
    createUser.error instanceof ApiError ? createUser.error.message : createUser.isError ? "Nao foi possivel criar o usuario." : null;

  return (
    <>
      <div className="page-head">
        <h2>Usuarios</h2>
      </div>

      <div className="cards-grid">
        <div className="card">
          <div className="card-header">
            <span>Novo usuario</span>
          </div>
          <form onSubmit={handleSubmit} className="form-grid user-form">
            <label className="field full">
              <span>Nome</span>
              <input value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={120} required />
            </label>
            <label className="field full">
              <span>E-mail</span>
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
            </label>
            <label className="field full">
              <span>Senha inicial</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={8}
                maxLength={120}
                autoComplete="new-password"
                required
              />
            </label>
            <label className="field full">
              <span>Perfil</span>
              <select value={role} onChange={(e) => setRole(e.target.value as "ADMIN" | "OPERATOR")}>
                <option value="OPERATOR">Operador</option>
                <option value="ADMIN">Administrador</option>
              </select>
            </label>
            {errorMessage && <div className="form-error full">{errorMessage}</div>}
            <div className="modal-footer full">
              <button type="submit" className="btn-primary" disabled={createUser.isPending}>
                {createUser.isPending ? "Salvando..." : "Criar usuario"}
              </button>
            </div>
          </form>
        </div>

        <div className="card">
          <div className="card-header">
            <span>Usuarios da organizacao</span>
          </div>
          {isLoading && <div className="empty">Carregando...</div>}
          {isError && <div className="empty">Nao foi possivel carregar os usuarios.</div>}
          {users && users.length === 0 && <div className="empty">Nenhum usuario cadastrado.</div>}
          {users && users.length > 0 && (
            <table className="stack-mobile">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>E-mail</th>
                  <th>Perfil</th>
                  {isAdmin && <th></th>}
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td>{user.name}</td>
                    <td data-label="E-mail">{user.email}</td>
                    <td data-label="Perfil">{user.role === "ADMIN" ? "Administrador" : "Operador"}</td>
                    {isAdmin && (
                      <td>
                        {user.id !== me?.id && (
                          <button
                            type="button"
                            className="btn-secondary"
                            disabled={changeRole.isPending}
                            onClick={() =>
                              changeRole.mutate({ userId: user.id, role: user.role === "ADMIN" ? "OPERATOR" : "ADMIN" })
                            }
                          >
                            {user.role === "ADMIN" ? "Tornar operador" : "Tornar admin"}
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
