from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from ..core.database import get_db
from ..core.security import decode_token
from ..core.config import settings
from ..models.user import User, UserRole
from fastapi.security import OAuth2PasswordBearer
import stripe
from datetime import datetime, timedelta

stripe.api_key = settings.STRIPE_SECRET_KEY
router = APIRouter(prefix="/payments", tags=["payments"])
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    payload = decode_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = db.query(User).filter(User.id == payload["sub"]).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

@router.post("/create-checkout")
def create_checkout(current_user: User = Depends(get_current_user)):
    try:
        session = stripe.checkout.Session.create(
            payment_method_types=["card"],
            line_items=[{
                "price": settings.STRIPE_PRO_PRICE_ID,
                "quantity": 1,
            }],
            mode="subscription",
            success_url="https://cosmix-xi.vercel.app/payment/success?session_id={CHECKOUT_SESSION_ID}",
            cancel_url="https://cosmix-xi.vercel.app/editor",
            customer_email=current_user.email,
            metadata={"user_id": str(current_user.id)},
        )
        return {"checkout_url": session.url}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/webhook")
async def stripe_webhook(request: Request, db: Session = Depends(get_db)):
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")
    
    try:
        if settings.STRIPE_WEBHOOK_SECRET:
            event = stripe.Webhook.construct_event(
                payload, sig_header, settings.STRIPE_WEBHOOK_SECRET
            )
        else:
            import json
            event = json.loads(payload)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    
    if event["type"] == "checkout.session.completed":
        session = event["data"]["object"]
        user_id = session.get("metadata", {}).get("user_id")
        if user_id:
            user = db.query(User).filter(User.id == user_id).first()
            if user:
                user.role = UserRole.pay_user
                user.stripe_customer_id = session.get("customer")
                user.stripe_subscription_id = session.get("subscription")
                db.commit()

    elif event["type"] in ["customer.subscription.deleted", "customer.subscription.paused"]:
        sub = event["data"]["object"]
        user = db.query(User).filter(User.stripe_subscription_id == sub["id"]).first()
        if user:
            user.role = UserRole.expired
            db.commit()

    return {"status": "ok"}

@router.get("/status")
def payment_status(current_user: User = Depends(get_current_user)):
    return {
        "role": current_user.role,
        "is_pro": current_user.role == UserRole.pay_user,
        "trial_end": current_user.trial_end,
    }
