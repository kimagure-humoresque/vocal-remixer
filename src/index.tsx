import React from 'react';
import ReactDOM from 'react-dom';
import './index.css';
import AppBase from './AppBase';
import SongList from './SongList';
import SongView from './SongView';
import { BrowserRouter, Route, Switch } from "react-router-dom";

ReactDOM.render(
  <React.StrictMode>
    <BrowserRouter basename={process.env.PUBLIC_URL}>
      <AppBase>
        <Switch>
          <Route path="/songview" component={SongView}/>
          <Route path="*" component={SongList}/>
        </Switch>
      </AppBase>
    </BrowserRouter>
  </React.StrictMode>,
  document.getElementById('root')
);
