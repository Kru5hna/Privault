pub enum AppError{
   Database(String),
   BadRequest(String),
   NotFound(String),
   Internal(anyhow::Error)
}

