from ..models.user import UserRole

# Job limits per billing period
ROLE_JOB_LIMITS = {
    UserRole.trial: 10,
    UserRole.pay_user: 50,      # Pro
    UserRole.free_user: None,   # unlimited (admin gift)
    UserRole.admin: None,       # unlimited
}

# Premium users get 200 — stored in user.subscription_tier
PREMIUM_JOB_LIMIT = 200

# Feature access per role
ROLE_FEATURES = {
    UserRole.trial: {
        'auto_cut': True,
        'subtitle_only': True,
        'suggest_edits': True,
        'chat_edit': True,
        'max_export_quality': '720p',
        'watermark': True,
        'priority': False,
    },
    UserRole.pay_user: {  # Pro
        'auto_cut': True,
        'subtitle_only': True,
        'suggest_edits': False,
        'chat_edit': False,
        'max_export_quality': '1080p',
        'watermark': False,
        'priority': False,
    },
    UserRole.free_user: {
        'auto_cut': True,
        'subtitle_only': True,
        'suggest_edits': True,
        'chat_edit': True,
        'max_export_quality': '1080p',
        'watermark': False,
        'priority': False,
    },
    UserRole.admin: {
        'auto_cut': True,
        'subtitle_only': True,
        'suggest_edits': True,
        'chat_edit': True,
        'max_export_quality': '4k',
        'watermark': False,
        'priority': True,
    },
}

def get_job_limit(role: UserRole, subscription_tier: str = 'pro') -> int | None:
    if role in [UserRole.admin, UserRole.free_user]:
        return None  # unlimited
    if role == UserRole.trial:
        return 10
    if role == UserRole.pay_user:
        return 200 if subscription_tier == 'premium' else 50
    return 10

def can_use_feature(role: UserRole, feature: str, subscription_tier: str = 'pro') -> bool:
    if role in [UserRole.admin, UserRole.free_user]:
        return True
    if role == UserRole.trial:
        return True  # trial gets everything but watermarked
    if role == UserRole.pay_user:
        if subscription_tier == 'premium':
            return True  # premium gets all features
        # Pro: no suggest_edits and chat_edit
        return feature not in ['suggest_edits', 'chat_edit']
    return False
