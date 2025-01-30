const jwt = require("jsonwebtoken");

const authMiddleware = (req, res, next) => {
  //req.headers-->{
  //  "Authorization": "Bearer eyJhbGciOiJIUzI1Ni
  //}
  const token = req?.header("Authorization")?.split(" ")[1];
  if (!token) {
    return res.status(401).json({ message: "Access denied.No token provided" });
  }
  try {
    const decoded = jwt.verify(token, "secret_key");
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid token" });
  }
};

module.exports = authMiddleware;