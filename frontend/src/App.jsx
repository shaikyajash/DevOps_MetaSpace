import React from "react";
import Signup from "./components/Screens/Signup";
import { Routes, Route } from "react-router-dom";
import Login from "./components/Screens/Login";
import Profile from "./components/Profile/Profile";
import ForgotPassword from "./components/Screens/ForgotPassword";
import Verification from "./components/Screens/Verification";
import ResetPassword from "./components/Screens/ResetPassword";
import Lobby from "./components/Screens/Lobby";
import GameScreen from "./components/Screens/GameScreen";

const App = () => {
  return (
    <Routes>
      <Route path="/signup" element={<Signup/>} />
      <Route path="/login" element={<Login />} />
      <Route path="/profile" element={<Profile />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="verify-email/:token" element={<Verification/>} />
      <Route path="/reset-password/:token" element={<ResetPassword />} />
      <Route path="/lobby" element={<Lobby/>} />
      <Route path="/game/:roomId" element={<GameScreen />} />
      <Route path="/game/:roomId/:username" element={<GameScreen />} />
      <Route path="/" element={<Lobby />} />
    </Routes>
  );
};

export default App;
