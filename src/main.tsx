import 'preact/compat';
import { render } from 'preact';
import { TabletopApp } from './ui/TabletopApp';

export function App() {
  return <TabletopApp />;
}

const container = document.getElementById('app');
if (container) {
  render(<App />, container);
}
