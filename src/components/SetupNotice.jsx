/** Shown instead of a blank white page when the Supabase env vars are missing. */
export default function SetupNotice() {
  return (
    <main className="setup">
      <div className="setup__card">
        <span className="setup__badge">Setup needed</span>
        <h1>Connect Supabase first</h1>
        <p>
          Create a <code>.env</code> file next to <code>package.json</code> with the two values
          from your Supabase project (Project Settings → API):
        </p>
        <pre>
{`VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci...`}
        </pre>
        <p>
          Then run <code>supabase/schema.sql</code> in the Supabase SQL editor and restart the dev
          server. Full steps are in <code>README.md</code>.
        </p>
      </div>
    </main>
  )
}
