import { BiggestMovers } from '../../components/newslane/news/biggestMovers/BiggestMovers';
import { GeneralNews } from '../../components/newslane/news/general/GeneralNews';
import { NewsLane } from '../../components/newslane/Newslane';
import { WelcomeView } from '../../components/welcomeView/WelcomeView';
import './Homepage.scss'

export default function Homepage() {
  return (
    <div className="page-container">
      <WelcomeView />
      <GeneralNews></GeneralNews>
      <BiggestMovers />
      <NewsLane></NewsLane>
    </div>
  );
}
