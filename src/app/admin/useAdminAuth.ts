import { useEffect, useState } from "react";

export function useAdminAuth() {
  const [password, setPassword] = useState("");
  const [authed, setAuthed] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    // sessionStorage는 브라우저에만 존재한다. SSR 첫 렌더와 클라이언트 첫 렌더를
    // 일치시켜 하이드레이션 불일치를 피하려면 마운트 후 effect에서 읽어야 한다.
    const saved = sessionStorage.getItem("admin_pw");
    if (saved) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPassword(saved);
      setAuthed(true);
    }
  }, []);

  async function login(pw: string) {
    setChecking(true);
    setError("");
    const res = await fetch("/api/admin/stats", {
      headers: { "x-admin-password": pw },
    });
    setChecking(false);
    if (res.ok) {
      sessionStorage.setItem("admin_pw", pw);
      setPassword(pw);
      setAuthed(true);
    } else {
      setError("비밀번호가 올바르지 않습니다.");
    }
  }

  function logout() {
    sessionStorage.removeItem("admin_pw");
    setAuthed(false);
    setPassword("");
  }

  return { password, authed, checking, error, login, logout };
}
