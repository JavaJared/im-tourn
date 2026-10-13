export default function EmptyState({ icon: Icon, title, children, action }) {
  return <div className="ui-empty">{Icon && <Icon size={28} aria-hidden="true"/>}<h2>{title}</h2>{children && <p>{children}</p>}{action}</div>;
}
