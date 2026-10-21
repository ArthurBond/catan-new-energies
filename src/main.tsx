import { render } from 'preact';

export function App() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
      <h1>CATAN: New Energies</h1>
      <p style={{ marginTop: '8px', color: '#888' }}>Core Engine & Tabletop Scaffold</p>
    </div>
  );
}

const container = document.getElementById('app');
if (container) {
  render(<App />, container);
}
