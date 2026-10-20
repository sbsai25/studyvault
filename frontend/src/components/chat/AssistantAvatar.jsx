import { Sparkles } from 'lucide-react';
import styles from './ChatMessage.module.css';

function AssistantAvatar() {
  return (
    <span className={styles.avatar} aria-hidden="true">
      <Sparkles size={16} />
    </span>
  );
}

export default AssistantAvatar;
