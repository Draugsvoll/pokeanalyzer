import { INFO_CARDS } from "../../data/infoCards";
import { getCustomColors } from "../../utils/customStylings";
import styles from "./HomeFeatureRow.module.scss";

export function HomeFeatureRow() {
  return (
    <section
      className={`default-container ${styles.root}`}
      aria-label="Platform features"
    >
      <div className={styles.row}>
        {INFO_CARDS.map((feature) => {
          const Icon = feature.icon;

          return (
            <article
              className={styles.item}
              key={feature.id}
              style={getCustomColors(feature.color)}
            >
              <span className={styles.icon} aria-hidden="true">
                <Icon size={19} strokeWidth={2} />
              </span>
              <span className={styles.text}>
                <span className={styles.title}>{feature.title}</span>
                <span className={styles.description}>
                  {feature.description}
                </span>
              </span>
            </article>
          );
        })}
      </div>
    </section>
  );
}
