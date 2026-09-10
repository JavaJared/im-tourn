import { useAuth } from '../../contexts/AuthContext';
import CustomPoolDetail from '../../components/CustomPoolDetail';

// The unified detail view adapts legacy brackets at read time. Keeping one
// subscription path avoids duplicate entry downloads and obsolete scoring UI.
export default function PoolDetailPage({ poolId, onNavigate }) {
  const { currentUser } = useAuth();
  return <CustomPoolDetail poolId={poolId} currentUserId={currentUser?.uid} currentUserName={currentUser?.displayName} onNavigate={onNavigate} />;
}
