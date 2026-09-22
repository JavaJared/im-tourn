import usePublicUsername from '../../lib/usePublicUsername';
export default function UsernameText({ userId }) {
  return usePublicUsername(userId);
}
