import { useEffect, useState } from "react";
import { supabase } from "./supabase";

export default function App() {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
      }
    );

    return () => listener.subscription.unsubscribe();
  }, []);

  async function handleSignUp() {
    await supabase.auth.signUp({
      email: "test@test.com",
      password: "password123"
    });
  }

  async function handleLogin() {
    await supabase.auth.signInWithPassword({
      email: "test@test.com",
      password: "password123"
    });
  }

  async function handleLogout() {
    await supabase.auth.signOut();
  }

  return (
    <div style={{ padding: 40, color: "white", background: "#0b1727", minHeight: "100vh" }}>
      <h1>Shared Priorities</h1>

      {!user ? (
        <>
          <button onClick={handleSignUp}>Sign Up</button>
          <button onClick={handleLogin}>Log In</button>
        </>
      ) : (
        <>
          <p>Logged in as: {user.email}</p>
          <button onClick={handleLogout}>Logout</button>
        </>
      )}
    </div>
  );
}
