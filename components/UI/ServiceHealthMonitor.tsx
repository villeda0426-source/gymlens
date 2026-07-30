import { useApiHealth } from "@/hooks/useApiHealth";

export default function ServiceHealthMonitor() {
  useApiHealth();
  return null;
}
