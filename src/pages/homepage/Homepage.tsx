import { NewsLane } from '../../components/newslane/Newslane';
import { JustTcgCardGrid } from '../../components/justTcgCardGrid/JustTcgCardGrid';
import { WelcomeView } from '../../components/welcomeView/WelcomeView';
import './Homepage.scss'

export default function Homepage() {
  return (
    <div className="page-container">
      <WelcomeView />
      <JustTcgCardGrid layout="swimlane" type="biggestGainers" />
      {/* <JustTcgCardGrid layout="swimlane" type="biggestLosers" /> */}
      <NewsLane />
    </div>
  );
}
