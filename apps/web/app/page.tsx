const panels = ["Profissional", "Administração"] as const;

export default function WebShell() {
  return (
    <main className="shell">
      <header className="topbar">
        <span className="brand">DayGym</span>
        <span className="environment">Prévia interna</span>
      </header>

      <section className="content" aria-labelledby="page-title">
        <p className="eyebrow">Painéis web</p>
        <h1 id="page-title">Acesso preparado.</h1>
        <p className="lead">
          As superfícies profissional e administrativa serão abertas com acesso
          autorizado.
        </p>

        <div className="panel-grid" aria-label="Superfícies previstas">
          {panels.map((panel) => (
            <article className="panel" key={panel}>
              <h2>{panel}</h2>
              <p>Disponível nas próximas etapas.</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
