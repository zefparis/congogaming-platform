import { TEAM_TO_ISO, FLAGS } from '../screens/predictionsShared';

export function Flag({ team, size = 24 }: { team: string; size?: number }) {
  const iso = TEAM_TO_ISO[team];
  if (iso) {
    return (
      <span
        className={`fi fi-${iso}`}
        style={{
          width: size,
          height: size * 0.75,
          display: 'inline-block',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          borderRadius: 2,
          overflow: 'hidden',
        }}
      />
    );
  }
  const emoji = FLAGS[team];
  return <span style={{ fontSize: size, lineHeight: 1, display: 'inline-block' }}>{emoji ?? '🏳️'}</span>;
}

export default Flag;
