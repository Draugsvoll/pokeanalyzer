import { NewsLane } from '../../components/newslane/Newslane';
import { JustTcgCardGrid } from '../../components/justTcgCardGrid/JustTcgCardGrid';
import { WelcomeView } from '../../components/welcomeView/WelcomeView';
import './Homepage.scss'

const HOME_MOVER_TYPES = ["biggestGainers", "biggestLosers"] as const;
const HOME_MOVER_PERIODS = ["7d", "30d", "90d"] as const;

export default function Homepage() {
  return (
    <div className="page-container">
      <WelcomeView />
      <JustTcgCardGrid types={HOME_MOVER_TYPES} periods={HOME_MOVER_PERIODS} />
      <NewsLane />
    </div>
  );
}
