import { Loader } from '../components/Loader';

// Instant route-transition fallback while the next page's code and data load.
export default function Loading() {
  return <Loader fullScreen />;
}
