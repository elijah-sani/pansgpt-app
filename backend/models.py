from sqlalchemy import Boolean, Column, ForeignKey, Integer, String, DateTime, Text, BigInteger
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship, declarative_base
import datetime
import uuid

Base = declarative_base()

class ChatSession(Base):
    __tablename__ = "chat_sessions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title = Column(String, default="New Chat")
    context_id = Column(String, nullable=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("profiles.id"), nullable=True) # Link to User Profile
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    messages = relationship("ChatMessage", back_populates="session", cascade="all, delete-orphan")
    user = relationship("UserProfile", back_populates="sessions")

class UserProfile(Base):
    __tablename__ = "profiles"

    id = Column(UUID(as_uuid=True), ForeignKey("auth.users.id"), primary_key=True)
    first_name = Column(String, nullable=True)
    other_names = Column(String, nullable=True)
    avatar_url = Column(String, nullable=True)
    subscription_tier = Column(String, default="free")
    university = Column(String, nullable=True)
    level = Column(String, nullable=True)

    sessions = relationship("ChatSession", back_populates="user")

class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(BigInteger, primary_key=True, index=True) 
    session_id = Column(UUID(as_uuid=True), ForeignKey("chat_sessions.id"))
    role = Column(String)
    content = Column(String)
    
    # NEW COLUMN for storing Base64 image strings
    image_data = Column(String, nullable=True) 
    
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    session = relationship("ChatSession", back_populates="messages")
